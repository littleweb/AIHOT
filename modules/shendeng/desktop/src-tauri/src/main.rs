use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const TASKS: [&str; 5] = ["research", "rankings", "fulltext", "publish", "oss"];

fn data_dir() -> PathBuf {
    // The local bundle controls the workspace it was built for.
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(4)
        .expect("desktop module inside site workspace")
        .join(".data/service")
}

fn read_json(path: PathBuf) -> Value {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(Value::Null)
}

fn recent_events(path: PathBuf) -> Vec<Value> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut reader = BufReader::new(file);
    let size = reader.get_ref().metadata().map(|m| m.len()).unwrap_or(0);
    let start = size.saturating_sub(192 * 1024);
    if reader.seek(SeekFrom::Start(start)).is_err() {
        return Vec::new();
    }
    if start > 0 {
        let _ = reader.read_until(b'\n', &mut Vec::new());
    }
    reader
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str(&line).ok())
        .collect()
}

#[tauri::command]
fn dashboard() -> Value {
    let dir = data_dir();
    let tasks = TASKS
        .iter()
        .map(|name| {
            let mut status = read_json(dir.join(format!("{name}-status.json")));
            if let Some(fields) = status.as_object_mut() {
                for key in ["skipped", "mergeSkipped", "failures", "files"] {
                    fields.remove(key);
                }
            }
            (
                name.to_string(),
                json!({
                    "status": status,
                    "queued": dir.join("requests").join(name).is_file(),
                }),
            )
        })
        .collect::<serde_json::Map<_, _>>();
    let oss = read_json(dir.join("oss.json"));
    let supervisor = read_json(dir.join("supervisor-status.json"));
    let runtime = read_json(dir.join("runtime.json"));
    let codex_ready = runtime["codex"]
        .as_str()
        .is_some_and(|p| Path::new(p).is_file());
    let oss_ready = oss["cli"].as_str().is_some_and(|p| Path::new(p).is_file())
        && oss["configFile"]
            .as_str()
            .is_some_and(|p| Path::new(p).is_file());
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64();
    let running = supervisor["updatedAt"]
        .as_f64()
        .is_some_and(|t| (0.0..30.0).contains(&(now - t)));
    let mut events = TASKS
        .iter()
        .flat_map(|name| recent_events(dir.join(format!("{name}-events.jsonl"))))
        .collect::<Vec<_>>();
    events.sort_by(|a, b| {
        b["updatedAt"]
            .as_f64()
            .partial_cmp(&a["updatedAt"].as_f64())
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    events.truncate(400);
    json!({
        "tasks": tasks, "events": events, "running": running, "codexReady": codex_ready,
        "ossReady": oss_ready, "ossActive": oss["mode"] == "active",
    })
}

#[tauri::command]
fn request_task(task: String) -> Result<(), String> {
    if !TASKS.contains(&task.as_str()) {
        return Err("未知任务".into());
    }
    if dashboard()["running"] != true {
        return Err("本机常驻服务未运行".into());
    }
    let dir = data_dir().join("requests");
    fs::create_dir_all(&dir).map_err(|_| "无法创建任务请求目录")?;
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dir.join(task))
    {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(_) => Err("无法提交任务请求".into()),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![dashboard, request_task])
        .run(tauri::generate_context!())
        .expect("start Shendeng desktop");
}
