mod books;
mod epub_name;
mod mdns;
mod opds;
mod optimizer;
mod widget;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Requests go through Rust so self-hosted servers work over plain http and
    // regardless of the server's CORS_ORIGINS (the webview would block both).
    .plugin(tauri_plugin_http::init())
    // Opens share-intent links (X, Bluesky...) in the user's browser.
    .plugin(tauri_plugin_opener::init())
    // https app links back from browser sign-in (OAuth callbacks).
    .plugin(tauri_plugin_deep_link::init())
    // Native UITabBar over the webview on iPhone (Liquid Glass on iOS 26).
    .plugin(tauri_plugin_system_components::init())
    .setup(|_app| {
      #[cfg(target_os = "ios")]
      restore_bounce(_app)?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      mdns::resolve_local,
      books::opds_feed,
      books::opds_search,
      books::download_book,
      books::list_downloads,
      books::delete_download,
      books::send_download,
      books::send_bytes,
      books::save_file,
      widget::update_widget,
      set_appearance,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// wry turns off the WKWebView's scroll bounce on iOS. Native apps rubber-band, even
// on pages too short to scroll, so turn it back on.
#[cfg(target_os = "ios")]
fn restore_bounce(app: &tauri::App) -> tauri::Result<()> {
  use tauri::Manager;
  let Some(window) = app.get_webview_window("main") else { return Ok(()) };
  window.with_webview(|webview| unsafe {
    use objc2::{msg_send, runtime::AnyObject};
    let view = &*(webview.inner() as *const AnyObject);
    let scroll: *mut AnyObject = msg_send![view, scrollView];
    let _: () = msg_send![scroll, setBounces: true];
    let _: () = msg_send![scroll, setAlwaysBounceVertical: true];
  })
}

// The in-app Appearance choice for native UI on iOS: status bar text, the tab bar,
// the keyboard. Tauri's setTheme doesn't reach iOS. "light" | "dark" | "system".
#[tauri::command]
fn set_appearance(window: tauri::WebviewWindow, pref: String) -> Result<(), String> {
  #[cfg(target_os = "ios")]
  window
    .with_webview(move |webview| unsafe {
      use objc2::{msg_send, runtime::AnyObject};
      let view = &*(webview.inner() as *const AnyObject);
      let win: *mut AnyObject = msg_send![view, window];
      // UIUserInterfaceStyle: 0 unspecified (follow the system), 1 light, 2 dark.
      let style: isize = match pref.as_str() { "light" => 1, "dark" => 2, _ => 0 };
      if !win.is_null() {
        let _: () = msg_send![win, setOverrideUserInterfaceStyle: style];
      }
    })
    .map_err(|e| e.to_string())?;
  #[cfg(not(target_os = "ios"))]
  let _ = (window, pref);
  Ok(())
}
