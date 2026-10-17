// The native shell exposes no custom commands and installs no native plugins.
// Charting, local browser storage and virtual trading run in the bundled frontend.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Signalhive Charts could not start");
}
