{
  description = "A flake for Werewolf Tauri project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem
      (system:
        let
          system = "x86_64-linux";
          overlays = [ (import rust-overlay) ];
          pkgs = import nixpkgs {
            inherit system overlays;
          };

          nativeBuildInputs = with pkgs; [
            pkg-config
            wrapGAppsHook
            bun
            nodejs
            cargo-tauri
            (rust-bin.stable.latest.default.override {
              extensions = [ "rust-src" "rust-analyzer" "clippy" "rustfmt" ];
              targets = [ "x86_64-unknown-linux-gnu" ];
            })
          ];

          buildInputs = with pkgs; [
            # Tauri system dependencies
            curl
            wget
            openssl
            
            # WebKit and GTK dependencies for Tauri
            webkitgtk_4_1
            gtk3
            cairo
            gdk-pixbuf
            glib
            pango
            harfbuzz
            librsvg
            libsoup_3
            at-spi2-atk
            atkmm
            
            # SSL and networking
            glib-networking
            cacert
            
            # Desktop integration
            gsettings-desktop-schemas
            
            # Additional libs that might be needed
            libsecret
          ];
        in
        with pkgs;
        {
          devShells.default = mkShell {
            nativeBuildInputs = nativeBuildInputs;
            buildInputs = buildInputs;

            shellHook = ''
              export XDG_DATA_DIRS=${gsettings-desktop-schemas}/share/gsettings-schemas/${gsettings-desktop-schemas.name}:${gtk3}/share/gsettings-schemas/${gtk3.name}:$XDG_DATA_DIRS
              export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath buildInputs}:$LD_LIBRARY_PATH
              export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"
              export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
              export NIX_SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
              export PKG_CONFIG_PATH="${pkgs.lib.makeSearchPathOutput "dev" "lib/pkgconfig" (buildInputs ++ nativeBuildInputs)}:$PKG_CONFIG_PATH"
              
              # Tauri specific environment
              export WEBKIT_DISABLE_COMPOSITING_MODE=1
              
              echo "🐺 Werewolf Tauri development environment loaded!"
              echo "Available commands:"
              echo "  bun run tauri dev    - Start development server"
              echo "  bun run tauri build  - Build for production"
              echo "  cargo check          - Check Rust code (in src-tauri/)"
            '';
          };
        });
}