{
  description = "Werewolf development environments";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rust-analyzer" "clippy" "rustfmt" ];
          targets = [ "x86_64-unknown-linux-gnu" ];
        };

        tauriNativeInputs = with pkgs; [
          pkg-config
          wrapGAppsHook
          bun
          nodejs_20
          cargo-tauri
          rustToolchain
        ];

        tauriBuildInputs = with pkgs; [
          curl
          wget
          openssl
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
          glib-networking
          cacert
          gsettings-desktop-schemas
          libsecret
        ];

        tauriShell = pkgs.mkShell {
          name = "werewolf-tauri";
          nativeBuildInputs = tauriNativeInputs;
          buildInputs = tauriBuildInputs;

          shellHook = ''
            export XDG_DATA_DIRS=${pkgs.lib.concatStringsSep ":" [
              "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}"
              "${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}"
              "$XDG_DATA_DIRS"
            ]}
            export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath tauriBuildInputs}:$LD_LIBRARY_PATH
            export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"
            export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
            export NIX_SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
            export PKG_CONFIG_PATH="${pkgs.lib.makeSearchPathOutput "dev" "lib/pkgconfig" (tauriBuildInputs ++ tauriNativeInputs)}:$PKG_CONFIG_PATH"
            export WEBKIT_DISABLE_COMPOSITING_MODE=1

            echo "🐺 Werewolf Tauri shell loaded (frozen legacy app — new work lives in werewolf-cloud/)"
            echo "  bun run tauri dev    # Start desktop app (legacy reference)"
            echo "  bun run tauri build  # Build desktop app (legacy reference)"
          '';
        };

        cloudShell = pkgs.mkShell {
          name = "werewolf-cloud";
          buildInputs = with pkgs; [
            bun
            nodejs_20
            wrangler
            sqlite
          ];

          shellHook = ''
            export XDG_CACHE_HOME="$PWD/.cache"
            mkdir -p "$XDG_CACHE_HOME"
            export NODE_OPTIONS="--enable-source-maps $NODE_OPTIONS"

            echo "☁️ Werewolf cloud shell loaded"
            echo "  cd werewolf-cloud && bun install                        # Install workspace dependencies"
            echo "  cd werewolf-cloud && bun run dev                        # Worker API + local D1/KV on :8787"
            echo "  cd werewolf-cloud && bun run check                      # Typecheck + lint + tests"
            echo "  cd werewolf-cloud/apps/web && PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev   # SvelteKit UI"
          '';
        };
      in {
        devShells = {
          tauri = tauriShell;
          cloud = cloudShell;
          default = cloudShell;
        };
      }
    );
}
