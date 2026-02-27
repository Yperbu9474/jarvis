#!/usr/bin/env bash
set -euo pipefail

# ── J.A.R.V.I.S. Installer ──────────────────────────────────────────
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vierisid/jarvis/main/install.sh | bash
#
# What this does:
#   1. Detects your OS (macOS / Linux / WSL)
#   2. Installs Bun if not already installed
#   3. Clones the repo & installs dependencies
#   4. Links the `jarvis` command globally
#   5. Runs the interactive setup wizard
#
# ─────────────────────────────────────────────────────────────────────

REPO_URL="https://github.com/vierisid/jarvis.git"
INSTALL_DIR="$HOME/.jarvis/daemon"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

print_banner() {
  echo -e "${CYAN}"
  echo "     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗"
  echo "     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝"
  echo "     ██║███████║██████╔╝██║   ██║██║███████╗"
  echo "██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║"
  echo "╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║"
  echo " ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝"
  echo -e "${RESET}"
  echo -e "${DIM}  Just A Rather Very Intelligent System${RESET}"
  echo ""
}

info() { echo -e "  ${CYAN}○${RESET} $1"; }
ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}!${RESET} $1"; }
err()  { echo -e "  ${RED}✗${RESET} $1"; }

# ── Detect OS ────────────────────────────────────────────────────────

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)
      if grep -qi "microsoft\|wsl" /proc/version 2>/dev/null; then
        echo "wsl"
      else
        echo "linux"
      fi
      ;;
    *) echo "unknown" ;;
  esac
}

# ── Ensure PATH includes bun global bin ──────────────────────────────

ensure_bun_path() {
  BUN_BIN="$HOME/.bun/bin"
  if [[ ":$PATH:" != *":$BUN_BIN:"* ]]; then
    export PATH="$BUN_BIN:$PATH"
  fi
}

add_path_to_shell() {
  BUN_BIN="$HOME/.bun/bin"
  SHELL_NAME=$(basename "$SHELL")

  case "$SHELL_NAME" in
    zsh)  PROFILE="$HOME/.zshrc" ;;
    bash) PROFILE="$HOME/.bashrc" ;;
    fish) PROFILE="$HOME/.config/fish/config.fish" ;;
    *)    PROFILE="$HOME/.profile" ;;
  esac

  if ! grep -q "\.bun/bin" "$PROFILE" 2>/dev/null; then
    echo "" >> "$PROFILE"
    echo "# Bun global bin (added by JARVIS installer)" >> "$PROFILE"
    echo "export PATH=\"\$HOME/.bun/bin:\$PATH\"" >> "$PROFILE"
    info "Added bun bin to ${PROFILE}"
  fi
}

# ── Main ─────────────────────────────────────────────────────────────

main() {
  print_banner

  OS=$(detect_os)
  echo -e "${BOLD}Detected OS:${RESET} ${OS}"
  echo ""

  if [ "$OS" = "unknown" ]; then
    err "Unsupported operating system. JARVIS supports macOS, Linux, and WSL."
    exit 1
  fi

  # ── Step 1: Check / Install Bun ──────────────────────────────────

  echo -e "${CYAN}[1/4]${RESET} ${BOLD}Checking Bun runtime...${RESET}"

  if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    ok "Bun v${BUN_VERSION} is installed"
  else
    info "Bun not found. Installing..."
    curl -fsSL https://bun.sh/install | bash

    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if command -v bun &> /dev/null; then
      ok "Bun installed successfully (v$(bun --version))"
    else
      err "Failed to install Bun. Please install manually: https://bun.sh"
      exit 1
    fi
  fi

  echo ""

  # ── Step 2: Clone / Update repo ─────────────────────────────────

  echo -e "${CYAN}[2/4]${RESET} ${BOLD}Downloading J.A.R.V.I.S...${RESET}"

  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Existing installation found. Updating..."
    git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || {
      warn "Could not fast-forward. Re-cloning..."
      rm -rf "$INSTALL_DIR"
      git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    }
    ok "Updated to latest version"
  else
    if [ -d "$INSTALL_DIR" ]; then
      rm -rf "$INSTALL_DIR"
    fi
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    ok "Downloaded JARVIS"
  fi

  echo ""

  # ── Step 3: Install dependencies & link ─────────────────────────

  echo -e "${CYAN}[3/4]${RESET} ${BOLD}Installing dependencies...${RESET}"

  cd "$INSTALL_DIR"
  bun install --frozen-lockfile 2>/dev/null || bun install
  ok "Dependencies installed"

  # Link the jarvis command globally via bun link
  bun link 2>/dev/null || true
  bun link @jarvis-ai/daemon 2>/dev/null || true

  ensure_bun_path
  add_path_to_shell

  if command -v jarvis &> /dev/null; then
    ok "jarvis command is available"
  else
    # bun link didn't work — create a shell wrapper as fallback
    BUN_BIN="$HOME/.bun/bin"
    mkdir -p "$BUN_BIN"
    printf '#!/usr/bin/env bash\nexec bun "%s/bin/jarvis.ts" "$@"\n' "$INSTALL_DIR" > "$BUN_BIN/jarvis"
    chmod +x "$BUN_BIN/jarvis"

    ensure_bun_path

    if command -v jarvis &> /dev/null; then
      ok "jarvis command is available"
    else
      warn "jarvis installed but not in PATH yet. Restart your terminal or run:"
      echo -e "    ${DIM}export PATH=\"\$HOME/.bun/bin:\$PATH\"${RESET}"
    fi
  fi

  echo ""

  # ── Step 4: Run Onboard Wizard ─────────────────────────────────

  echo -e "${CYAN}[4/4]${RESET} ${BOLD}Running setup wizard...${RESET}"
  echo ""

  ensure_bun_path
  jarvis onboard
}

main "$@"
