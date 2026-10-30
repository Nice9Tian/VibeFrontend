use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{Emitter, Manager};

/// 设计项目所在的文件夹，按顺序查找：
/// 1. 环境变量 VF_PROJECT；
/// 2. 可执行文件旁边的 project/；
/// 3. 可执行文件上一级的 project/（可执行文件放在仓库的 release/ 里时就是这种情况）；
/// 4. 编译时仓库里的 project/（开发时使用）。
fn project_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("VF_PROJECT") {
        return PathBuf::from(dir);
    }
    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|exe| exe.parent().map(Path::to_path_buf)) {
        for candidate in [exe_dir.join("project"), exe_dir.join("..").join("project")] {
            if candidate.join("project.json").is_file() {
                return candidate;
            }
        }
    }
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("project")
}

/// 用户收藏素材库所在的文件夹：
/// 1. 环境变量 VF_LIBRARY；
/// 2. 应用数据目录下的 VibeFrontend/library/。
fn library_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("VF_LIBRARY") {
        return PathBuf::from(dir);
    }
    if let Ok(appdata) = std::env::var("APPDATA").or_else(|_| std::env::var("LOCALAPPDATA")) {
        return PathBuf::from(appdata).join("VibeFrontend").join("library");
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".config").join("VibeFrontend").join("library");
    }
    project_dir().join(".designer").join("library")
}

/// 把网页传来的相对路径解析到指定文件夹内，拒绝绝对路径、`.` 和 `..`。
fn resolve_in(base: PathBuf, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    for part in rel_path.components() {
        match part {
            Component::Normal(_) => {}
            _ => return Err(format!("路径不在文件夹内：{rel}")),
        }
    }
    Ok(base.join(rel_path))
}

fn ensure_non_empty_rel(rel: &str) -> Result<(), String> {
    let rel_path = Path::new(rel);
    let mut has_normal = false;
    for part in rel_path.components() {
        match part {
            Component::Normal(_) => has_normal = true,
            _ => return Err(format!("非法相对路径：{rel}")),
        }
    }
    if !has_normal {
        return Err("路径不能为空或当前目录".to_string());
    }
    Ok(())
}

fn ensure_writable_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "preview" {
        return Err("独立预览窗口为只读权限，不允许写盘或删除文件".to_string());
    }
    Ok(())
}

/// 把网页传来的相对路径解析到项目文件夹内，拒绝绝对路径和 `..`。
fn resolve(rel: &str) -> Result<PathBuf, String> {
    resolve_in(project_dir(), rel)
}

/// 把网页传来的相对路径解析到用户素材库文件夹内，拒绝绝对路径和 `..`。
fn resolve_library(rel: &str) -> Result<PathBuf, String> {
    resolve_in(library_dir(), rel)
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

#[tauri::command]
fn project_root() -> Result<String, String> {
    let dir = project_dir();
    let dir = dir.canonicalize().map_err(|e| format!("找不到项目文件夹 {}：{e}", dir.display()))?;
    // Windows 上 canonicalize 会带 \\?\ 前缀，显示给用户前去掉
    Ok(dir.to_string_lossy().trim_start_matches(r"\\?\").to_string())
}

#[tauri::command]
fn read_text(path: String) -> Result<Option<String>, String> {
    ensure_non_empty_rel(&path)?;
    let full = resolve(&path)?;
    match std::fs::read_to_string(&full) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("读取 {path} 失败：{e}")),
    }
}

#[tauri::command]
fn write_text(window: tauri::WebviewWindow, path: String, content: String) -> Result<(), String> {
    ensure_writable_window(&window)?;
    ensure_non_empty_rel(&path)?;
    let full = resolve(&path)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }
    std::fs::write(&full, content).map_err(|e| format!("写入 {path} 失败：{e}"))
}

#[tauri::command]
fn remove_file(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    ensure_writable_window(&window)?;
    ensure_non_empty_rel(&path)?;
    let full = resolve(&path)?;
    if full.is_file() {
        std::fs::remove_file(&full).map_err(|e| format!("删除 {path} 失败：{e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let full = resolve(&path)?;
    let read = match std::fs::read_dir(&full) {
        Ok(read) => read,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("列出 {path} 失败：{e}")),
    };
    let mut entries = Vec::new();
    for entry in read.flatten() {
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
fn library_root() -> Result<String, String> {
    let dir = library_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建素材库目录失败：{e}"))?;
    let dir = dir.canonicalize().unwrap_or(dir);
    Ok(dir.to_string_lossy().trim_start_matches(r"\\?\").to_string())
}

#[tauri::command]
fn library_read_text(path: String) -> Result<Option<String>, String> {
    ensure_non_empty_rel(&path)?;
    let full = resolve_library(&path)?;
    match std::fs::read_to_string(&full) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("读取素材库 {path} 失败：{e}")),
    }
}

#[tauri::command]
fn library_write_text(window: tauri::WebviewWindow, path: String, content: String) -> Result<(), String> {
    ensure_writable_window(&window)?;
    ensure_non_empty_rel(&path)?;
    let full = resolve_library(&path)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建素材库目录失败：{e}"))?;
    }
    std::fs::write(&full, content).map_err(|e| format!("写入素材库 {path} 失败：{e}"))
}

#[tauri::command]
fn library_list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let full = resolve_library(&path)?;
    let read = match std::fs::read_dir(&full) {
        Ok(read) => read,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("列出素材库 {path} 失败：{e}")),
    };
    let mut entries = Vec::new();
    for entry in read.flatten() {
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
fn library_remove_dir(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    ensure_writable_window(&window)?;
    let rel_path = Path::new(&path);
    let mut comps = rel_path.components();
    match (comps.next(), comps.next()) {
        (Some(Component::Normal(_)), None) => {}
        _ => return Err(format!("只允许删除素材库下的一级子目录：{path}")),
    }
    let base = library_dir();
    let full = resolve_library(&path)?;
    if full == base {
        return Err("不能删除素材库根目录".to_string());
    }
    if full.exists() {
        std::fs::remove_dir_all(&full).map_err(|e| format!("删除素材库 {path} 失败：{e}"))?;
    }
    Ok(())
}

/// 监听项目文件夹，文件有变化就通知网页重新加载。
fn start_watcher(app: &tauri::AppHandle) -> notify::Result<RecommendedWatcher> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if event.kind.is_access() {
                return;
            }
            let _ = handle.emit("project-changed", ());
        }
    })?;
    watcher.watch(&project_dir(), RecursiveMode::Recursive)?;
    Ok(watcher)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            match start_watcher(app.handle()) {
                // watcher 被丢弃就会停止监听，所以交给应用状态保管
                Ok(watcher) => {
                    app.manage(Mutex::new(watcher));
                }
                Err(e) => eprintln!("无法监听项目文件夹：{e}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project_root,
            read_text,
            write_text,
            remove_file,
            list_dir,
            library_root,
            library_read_text,
            library_write_text,
            library_list_dir,
            library_remove_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
