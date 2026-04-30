# ~/.profile — xbot user

# Base PATH
export PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:$PATH"

# Node via nvm (if installed)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# ── xBot license server ───────────────────────────────────────────────────────
export XBOT_SERVER_DIR="/opt/xbot-license"
export ADMIN_USER="admin"
export ADMIN_PASS="CHANGE_ME"                       # set your actual password here
export PORT="3741"

# ── Aliases ───────────────────────────────────────────────────────────────────

# ls variants
alias ls="ls --color=auto"
alias l="ls -lh --color=auto"          # long, human-readable sizes
alias ll="ls -lah --color=auto"        # long + hidden files
alias la="ls -A --color=auto"          # hidden files, no . and ..
alias lt="ls -lth --color=auto"        # sorted by newest first
alias lS="ls -lSh --color=auto"        # sorted by size

# navigation
alias ..="cd .."
alias ...="cd ../.."
alias ~="cd ~"

# safety nets
alias rm="rm -i"
alias cp="cp -i"
alias mv="mv -i"

# disk & processes
alias df="df -h"
alias du="du -h --max-depth=1"
alias top="htop 2>/dev/null || top"
alias psg="ps aux | grep -v grep | grep"   # usage: psg node

# network
alias ports="ss -tulnp"                # open listening ports
alias myip="curl -s ifconfig.me"

# git
alias gs="git status"
alias gl="git log --oneline --graph --decorate -20"
alias gd="git diff"

# misc
alias cls="clear"
alias h="history | tail -30"
alias path='echo $PATH | tr ":" "\n"'

# xbot service
alias xbot-start="sudo systemctl start xbot-license"
alias xbot-stop="sudo systemctl stop xbot-license"
alias xbot-restart="sudo systemctl restart xbot-license"
alias xbot-status="sudo systemctl status xbot-license"
alias xbot-logs="sudo journalctl -u xbot-license -f"
alias xbot-add="node $XBOT_SERVER_DIR/add-key.mjs"

# ── Prompt ────────────────────────────────────────────────────────────────────
RESET="\[\e[0m\]"
BOLD="\[\e[1m\]"
GREEN="\[\e[32m\]"
CYAN="\[\e[36m\]"
YELLOW="\[\e[33m\]"

PS1="${BOLD}${GREEN}\u${RESET}@${CYAN}\h${RESET}:${YELLOW}\w${RESET}\$ "

# ── Welcome ───────────────────────────────────────────────────────────────────
echo ""
echo "  ⚡ xBot License Server"
echo "  status  : $(systemctl is-active xbot-license 2>/dev/null || echo 'not installed')"
echo "  url     : http://localhost:$PORT"
echo ""
echo "  xbot-status   xbot-logs   xbot-restart"
echo "  xbot-add 'PlayerName' 'note'"
echo ""
