use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    VIRTUAL_KEY,
};

const QUICK_WINDOW_LABEL: &str = "quick";
const SETTINGS_WINDOW_LABEL: &str = "settings";
const DEFAULT_HOTKEY: &str = "Alt+S";

#[tauri::command]
fn show_quick_input(app: AppHandle) -> Result<(), String> {
    let win = quick_window(&app)?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_quick_input(app: AppHandle) -> Result<(), String> {
    quick_window(&app)
        .and_then(|w| w.hide().map_err(|e| e.to_string()))
}

#[tauri::command]
fn show_settings(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        let _ = win.set_size(LogicalSize::new(520.0, 620.0));
        let _ = win.center();
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        WebviewWindowBuilder::new(
            &app,
            SETTINGS_WINDOW_LABEL,
            WebviewUrl::App("index.html?window=settings".into()),
        )
        .title("symbolPop Settings")
        .inner_size(520.0, 620.0)
        .visible(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn toggle_quick_input(app: AppHandle) -> Result<(), String> {
    let win = quick_window(&app)?;
    let is_visible = win.is_visible().unwrap_or(false);
    if is_visible {
        win.hide().map_err(|e| e.to_string())?;
    } else {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn insert_text(text: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        inject_text_windows(&text)
    }
    #[cfg(not(windows))]
    {
        Err("text injection is only implemented on Windows".into())
    }
}

fn quick_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(QUICK_WINDOW_LABEL)
        .ok_or_else(|| "quick input window not found".to_string())
}

#[tauri::command]
fn update_hotkey(app: AppHandle, hotkey: String) -> Result<(), String> {
    use std::str::FromStr;

    let parsed = Shortcut::from_str(&hotkey).map_err(|e| e.to_string())?;
    let gs = app.global_shortcut();
    if let Err(e) = gs.unregister_all() {
        eprintln!("failed to unregister hotkeys: {e}");
    }
    gs.on_shortcut(parsed.clone(), move |app, _, event| {
        if event.state == ShortcutState::Pressed {
            let _ = toggle_quick_input(app.clone());
        }
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let quick_item = MenuItemBuilder::new("Quick Input")
        .id("quick_input")
        .build(app)?;
    let settings_item = MenuItemBuilder::new("Settings")
        .id("open_settings")
        .build(app)?;
    let quit_item = MenuItemBuilder::new("Quit")
        .id("quit")
        .build(app)?;

    let tray_menu = MenuBuilder::new(app)
        .items(&[&quick_item, &settings_item, &quit_item])
        .build()?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&tray_menu)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                let _ = show_settings(tray.app_handle().clone());
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quick_input" => {
                let _ = toggle_quick_input(app.clone());
            }
            "open_settings" => {
                let _ = show_settings(app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn register_hotkey(app: &tauri::AppHandle) {
    use std::str::FromStr;
    match Shortcut::from_str(DEFAULT_HOTKEY) {
        Ok(shortcut) => {
            let app_handle = app.clone();
            let handler_app = app_handle.clone();
            if let Err(err) = app_handle.global_shortcut().on_shortcut(
                shortcut.clone(),
                move |_, _, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = toggle_quick_input(handler_app.clone());
                    }
                },
            ) {
                eprintln!("failed to register shortcut handler: {err}");
            }
        }
        Err(err) => eprintln!("invalid default hotkey {DEFAULT_HOTKEY}: {err}"),
    }
}

fn create_windows(app: &mut tauri::App) -> tauri::Result<()> {
    WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=settings".into()),
    )
    .title("symbolPop Settings")
    .inner_size(520.0, 620.0)
    .visible(false)
    .center()
    .build()?;

    WebviewWindowBuilder::new(
        app,
        QUICK_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=quick".into()),
    )
    .title("symbolPop Quick Input")
    .inner_size(520.0, 240.0)
    .decorations(false)
    .transparent(true)
    .resizable(false)
    .always_on_top(true)
    .visible(false)
    .center()
    .skip_taskbar(true)
    .build()?;

    Ok(())
}

#[cfg(windows)]
fn inject_text_windows(text: &str) -> Result<(), String> {
    use std::mem::size_of;

    let mut inputs: Vec<INPUT> = Vec::with_capacity(text.encode_utf16().count() * 2);
    for unit in text.encode_utf16() {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }

    if inputs.is_empty() {
        return Ok(());
    }

    let expected = inputs.len();
    let sent = unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) } as usize;
    if sent != expected {
        return Err(format!("SendInput sent {sent}/{expected} events"));
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            show_quick_input,
            hide_quick_input,
            toggle_quick_input,
            show_settings,
            insert_text,
            update_hotkey
        ])
        .setup(|app| {
            create_windows(app)?;
            build_tray(app)?;
            register_hotkey(&app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
