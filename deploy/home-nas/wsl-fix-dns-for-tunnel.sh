#!/usr/bin/env bash
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true

[network]
generateResolvConf = false
EOF
sudo tee /etc/resolv.conf >/dev/null <<'EOF'
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF
sudo chattr -i /etc/resolv.conf 2>/dev/null || true
sudo chattr +i /etc/resolv.conf 2>/dev/null || true
echo "OK: systemd + fixed DNS. Run: wsl --shutdown"
