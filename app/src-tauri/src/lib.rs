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

/// 把网页传来的相对路径解析到项目文件夹内，拒绝绝对路径和 `..`。
fn resolve(rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    for part in rel_path.components() {
        match part {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(format!("路径不在项目文件夹内：{rel}")),
        }
    }
    Ok(project_dir().join(rel_path))
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
    let full = resolve(&path)?;
    match std::fs::read_to_string(&full) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("读取 {path} 失败：{e}")),
    }
}

#[tauri::command]
fn write_text(path: String, content: String) -> Result<(), String> {
    let full = resolve(&path)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }
    std::fs::write(&full, content).map_err(|e| format!("写入 {path} 失败：{e}"))
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
        .invoke_handler(tauri::generate_handler![project_root, read_text, write_text, list_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
