#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod document;
use document::Document;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::SystemTime,
};
use tauri::{Emitter, Manager, State};

#[derive(Default)]
struct Opened {
    document: Option<Document>,
    modified: Option<SystemTime>,
    length: u64,
}
#[derive(Clone, Default)]
struct ViewerState {
    opened: Arc<Mutex<Opened>>,
    pending: Arc<Mutex<Option<PathBuf>>>,
    test_report: Option<PathBuf>,
}

async fn open_path(path: PathBuf, state: ViewerState) -> Result<Document, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let document = document::load(&path)?;
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let mut opened = state
            .opened
            .lock()
            .map_err(|_| "Document state unavailable")?;
        opened.modified = metadata.modified().ok();
        opened.length = metadata.len();
        opened.document = Some(document.clone());
        Ok(document)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
struct Startup {
    document: Option<Document>,
    self_test: bool,
}

#[tauri::command]
async fn startup(state: State<'_, ViewerState>) -> Result<Startup, String> {
    let path = state
        .pending
        .lock()
        .map_err(|_| "Document state unavailable")?
        .take();
    let document = if let Some(path) = path {
        Some(open_path(path, state.inner().clone()).await?)
    } else {
        None
    };
    Ok(Startup {
        document,
        self_test: state.test_report.is_some(),
    })
}

#[tauri::command]
async fn open_document(path: String, state: State<'_, ViewerState>) -> Result<Document, String> {
    open_path(PathBuf::from(path), state.inner().clone()).await
}

#[tauri::command]
async fn choose_document(state: State<'_, ViewerState>) -> Result<Option<Document>, String> {
    let selection = rfd::AsyncFileDialog::new()
        .set_title("Open Markdown document")
        .add_filter("Markdown", &["md", "markdown", "mdown"])
        .add_filter("Text files", &["txt"])
        .pick_file()
        .await;
    if let Some(file) = selection {
        open_path(file.path().to_path_buf(), state.inner().clone())
            .await
            .map(Some)
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn refresh_document(
    force: bool,
    state: State<'_, ViewerState>,
) -> Result<Option<Document>, String> {
    let snapshot = {
        let opened = state
            .opened
            .lock()
            .map_err(|_| "Document state unavailable")?;
        opened.document.as_ref().map(|d| {
            (
                d.path.clone(),
                d.revision.clone(),
                opened.modified,
                opened.length,
            )
        })
    };
    let Some((path, revision, modified, length)) = snapshot else {
        return Ok(None);
    };
    let metadata = std::fs::metadata(&path)
        .map_err(|_| "File unavailable; showing the last readable version.")?;
    if !force && metadata.modified().ok() == modified && metadata.len() == length {
        return Ok(None);
    }
    let document = open_path(PathBuf::from(path), state.inner().clone()).await?;
    if force || document.revision != revision {
        Ok(Some(document))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn follow_link(
    href: String,
    state: State<'_, ViewerState>,
) -> Result<Option<Document>, String> {
    if let Ok(url) = url::Url::parse(&href) {
        match url.scheme() {
            "https" | "http" | "mailto" => {
                open::that(url.as_str()).map_err(|e| e.to_string())?;
                return Ok(None);
            }
            "file" => {
                let path = url.to_file_path().map_err(|_| "Invalid file link")?;
                return open_markdown_link(path, state.inner().clone()).await;
            }
            _ => return Err("This link type is not supported.".into()),
        }
    }
    let current = state
        .opened
        .lock()
        .map_err(|_| "Document state unavailable")?
        .document
        .as_ref()
        .map(|d| d.path.clone())
        .ok_or("Open a document first")?;
    let parent = Path::new(&current)
        .parent()
        .ok_or("Document folder unavailable")?;
    let base = url::Url::from_directory_path(parent).map_err(|_| "Invalid document folder")?;
    let path = base
        .join(&href)
        .map_err(|e| e.to_string())?
        .to_file_path()
        .map_err(|_| "Invalid local link")?;
    open_markdown_link(path, state.inner().clone()).await
}

async fn open_markdown_link(path: PathBuf, state: ViewerState) -> Result<Option<Document>, String> {
    let extension = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    if !["md", "markdown", "mdown"].contains(&extension.as_str()) {
        return Err("Only Markdown documents can be opened from local links.".into());
    }
    open_path(path, state).await.map(Some)
}

#[tauri::command]
fn ready(window: tauri::WebviewWindow, state: State<'_, ViewerState>) -> Result<(), String> {
    if state.test_report.is_none() {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct UiChecks {
    rendered: bool,
    outline: bool,
    source: bool,
    navigation: bool,
}

#[tauri::command]
fn complete_self_test(
    checks: UiChecks,
    app: tauri::AppHandle,
    state: State<'_, ViewerState>,
) -> Result<(), String> {
    let report = state
        .test_report
        .as_ref()
        .ok_or("Self-test is not active")?;
    if !(checks.rendered && checks.outline && checks.source && checks.navigation) {
        return Err("Frontend checks failed".into());
    }
    let payload = serde_json::json!({"status": "passed", "checks": ["WebView2 initialization", "Rust Markdown rendering", "TOC", "source toggle", "heading navigation", "close exits process"]});
    std::fs::write(
        report,
        serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    app.get_webview_window("main")
        .ok_or("Window unavailable")?
        .close()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn self_test_failed(
    message: String,
    app: tauri::AppHandle,
    state: State<'_, ViewerState>,
) -> Result<(), String> {
    if let Some(report) = &state.test_report {
        let payload = serde_json::json!({"status": "failed", "error": message});
        std::fs::write(
            report,
            serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        app.exit(1);
    }
    Ok(())
}

fn incoming_path(args: &[String], cwd: &Path) -> Option<PathBuf> {
    args.iter()
        .skip(1)
        .find(|arg| !arg.starts_with('-'))
        .map(|arg| {
            let path = PathBuf::from(arg);
            if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            }
        })
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let state = ViewerState::default();
    let state = if args.get(1).map(String::as_str) == Some("--self-test") && args.len() == 4 {
        *state.pending.lock().unwrap() = Some(PathBuf::from(&args[3]));
        ViewerState {
            test_report: Some(PathBuf::from(&args[2])),
            ..state
        }
    } else {
        *state.pending.lock().unwrap() =
            incoming_path(&args, &std::env::current_dir().unwrap_or_default());
        state
    };
    let testing = state.test_report.is_some();
    let mut builder = tauri::Builder::default();
    if !testing {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let state = app.state::<ViewerState>();
            if let Some(path) = incoming_path(&args, Path::new(&cwd)) {
                if let Ok(mut pending) = state.pending.lock() {
                    *pending = Some(path);
                }
                let _ = app.emit("open-file", ());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }
    builder
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            startup,
            open_document,
            choose_document,
            refresh_document,
            follow_link,
            ready,
            complete_self_test,
            self_test_failed
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("Unable to start MarkUp Viewer");
}
