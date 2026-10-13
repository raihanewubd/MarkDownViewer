use base64::{engine::general_purpose::STANDARD, Engine};
use pulldown_cmark::{html, CowStr, Event, Options, Parser, Tag};
use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
};

const MAX_DOCUMENT: u64 = 20 * 1024 * 1024;
const MAX_IMAGE: u64 = 10 * 1024 * 1024;

#[derive(Clone, Serialize, Debug)]
pub struct Heading {
    pub level: u8,
    pub text: String,
    pub id: String,
}

#[derive(Clone, Serialize)]
pub struct Document {
    pub path: String,
    pub name: String,
    pub source: String,
    pub html: String,
    pub headings: Vec<Heading>,
    pub revision: String,
}

fn embedded_image(destination: &str, parent: &Path) -> Option<String> {
    let path = if let Ok(url) = url::Url::parse(destination) {
        if url.scheme() != "file" {
            return None;
        }
        url.to_file_path().ok()?
    } else {
        // Decode URL-encoded spaces without treating + as a space.
        let base = url::Url::from_directory_path(parent).ok()?;
        base.join(destination).ok()?.to_file_path().ok()?
    };
    let mime = match path.extension()?.to_string_lossy().to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => return None,
    };
    if fs::metadata(&path).ok()?.len() > MAX_IMAGE {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

pub fn render(source: &str, parent: &Path) -> (String, Vec<Heading>) {
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let mut headings: Vec<Heading> = Vec::new();
    let mut heading_index = None;
    let mut events = Vec::new();
    for event in Parser::new_ext(source, options) {
        match event {
            Event::Start(Tag::Heading {
                level,
                classes,
                attrs,
                ..
            }) => {
                let id = format!("section-{}", headings.len());
                headings.push(Heading {
                    level: level as u8,
                    text: String::new(),
                    id: id.clone(),
                });
                heading_index = Some(headings.len() - 1);
                events.push(Event::Start(Tag::Heading {
                    level,
                    id: Some(CowStr::from(id)),
                    classes,
                    attrs,
                }));
            }
            Event::End(pulldown_cmark::TagEnd::Heading(level)) => {
                heading_index = None;
                events.push(Event::End(pulldown_cmark::TagEnd::Heading(level)));
            }
            Event::Text(ref text) | Event::Code(ref text) => {
                if let Some(index) = heading_index {
                    headings[index].text.push_str(text);
                }
                events.push(event);
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some(index) = heading_index {
                    headings[index].text.push(' ');
                }
                events.push(event);
            }
            // Raw HTML in files is text; only renderer-produced markup reaches the sanitizer.
            Event::Html(raw) | Event::InlineHtml(raw) => events.push(Event::Text(raw)),
            Event::Start(Tag::Image {
                link_type,
                dest_url,
                title,
                id,
            }) => {
                let target = embedded_image(&dest_url, parent)
                    .map(CowStr::from)
                    .unwrap_or(dest_url);
                events.push(Event::Start(Tag::Image {
                    link_type,
                    dest_url: target,
                    title,
                    id,
                }));
            }
            other => events.push(other),
        }
    }
    for heading in &mut headings {
        heading.text = heading.text.trim().to_string();
        if heading.text.is_empty() {
            heading.text = "Untitled heading".into();
        }
    }
    let mut rendered = String::new();
    html::push_html(&mut rendered, events.into_iter());
    let mut sanitizer = ammonia::Builder::default();
    sanitizer
        .add_generic_attributes(&["id"])
        .add_tags(&["input"])
        .add_tag_attributes("input", &["type", "checked", "disabled"])
        .add_url_schemes(&["data"]);
    (sanitizer.clean(&rendered).to_string(), headings)
}

pub fn load(path: &Path) -> Result<Document, String> {
    let canonical: PathBuf = path
        .canonicalize()
        .map_err(|e| format!("Cannot open document: {e}"))?;
    let metadata = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("Choose a Markdown file, not a folder.".into());
    }
    if metadata.len() > MAX_DOCUMENT {
        return Err("This document exceeds the 20 MB reading limit.".into());
    }
    let bytes = fs::read(&canonical).map_err(|e| format!("Cannot read document: {e}"))?;
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let source = String::from_utf8(bytes.to_vec())
        .map_err(|_| "This file is not UTF-8 text.".to_string())?;
    let mut hash = DefaultHasher::new();
    source.hash(&mut hash);
    // A normal Windows path (without the extended prefix) is easier to read and pass to shell dialogs.
    let original_path = canonical.to_string_lossy();
    let display_path = if let Some(unc) = original_path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        original_path.trim_start_matches(r"\\?\").to_string()
    };
    let normal_path = Path::new(&display_path);
    let (rendered, headings) = render(&source, normal_path.parent().unwrap_or(Path::new(".")));
    Ok(Document {
        name: canonical
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        path: display_path,
        source,
        html: rendered,
        headings,
        revision: format!("{:x}", hash.finish()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outline_tracks_formatted_duplicate_and_setext_headings() {
        let (html, headings) = render(
            "# **One**\n### Child `code`\n# One\nSetext\n======\n```\n# hidden\n```",
            Path::new("."),
        );
        assert_eq!(
            headings.iter().map(|h| h.text.as_str()).collect::<Vec<_>>(),
            ["One", "Child code", "One", "Setext"]
        );
        assert_eq!(headings[1].level, 3);
        assert_ne!(headings[0].id, headings[2].id);
        assert!(html.contains("id=\"section-2\""));
    }
    #[test]
    fn scripts_and_unsafe_links_are_inert() {
        let (html, _) = render("<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![bad](javascript:alert(1))", Path::new("."));
        assert!(!html.contains("<script>"));
        assert!(!html.contains("href=\"javascript:"));
        assert!(!html.contains("src=\"javascript:"));
    }
    #[test]
    fn github_style_tables_and_tasks_render() {
        let (html, _) = render(
            "| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] Done\n\n~~old~~",
            Path::new("."),
        );
        assert!(html.contains("<table>"));
        assert!(html.contains("disabled"));
        assert!(html.contains("<del>old</del>"));
    }
    #[test]
    fn bom_and_relative_images_with_spaces_load() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(
            folder.path().join("small image.png"),
            [0x89, 0x50, 0x4e, 0x47],
        )
        .unwrap();
        let path = folder.path().join("sample.md");
        fs::write(&path, "\u{feff}# Image\n\n![Local](small%20image.png)").unwrap();
        let document = load(&path).unwrap();
        assert!(document.source.starts_with("# Image"));
        assert!(document.html.contains("data:image/png;base64,iVBORw=="));
        assert_eq!(document.headings[0].text, "Image");
    }
}
