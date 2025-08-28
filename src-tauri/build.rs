fn main() {
    // Tell Cargo to rerun this build script if migrations change
    println!("cargo:rerun-if-changed=migrations");

    tauri_build::build()
}
