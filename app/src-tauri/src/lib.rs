// Shell-ul Tauri (D51): aplicația e doar un client pentru interfața din /web; datele vin din API.
// Aici stau doar lucrurile pe care browserul nu le poate face:
//   - păstrarea refresh token-ului în stocarea securizată a sistemului (Keychain / Credential Manager);
//   - deep-link-ul achievementhub://auth/callback, prin care login-ul Steam se întoarce în aplicație;
//   - deschiderea paginii de login Steam în browserul sistemului (plugin-ul opener).

// Toate valorile stau sub același „serviciu” în Keychain; cheia (ex. „refresh_token”) e numele intrării.
const SERVICE: &str = "com.achievementhub.app";

fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, key).map_err(|error| error.to_string())
}

#[tauri::command]
fn secure_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn secure_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|error| error.to_string())
}

#[tauri::command]
fn secure_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Desktop: dacă aplicația e deja deschisă, link-ul achievementhub:// e trimis instanței existente.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![secure_get, secure_set, secure_delete])
        .setup(|_app| {
            // Pe Windows și Linux schema achievementhub:// se înregistrează la pornire (pe macOS / iOS o face Info.plist).
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                _app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("eroare la pornirea aplicației");
}
