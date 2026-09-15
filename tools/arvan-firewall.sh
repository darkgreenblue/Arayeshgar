#!/bin/bash
# Restricts port 8800 (the web app's listen port) to ArvanCloud's own CDN edge IPs, so the
# app can bind 0.0.0.0 (required for ArvanCloud to reach it as an origin) without actually
# being open to the whole internet. Only called when ARAYESHGAR_ARVAN_MODE=true.
#
# **Why not ufw:** ufw is inactive on this server (measured with `Ops → fw-status` before
# writing this), and other apps already listen on 0.0.0.0 with no firewall at all (ports
# 8081, 8791 — not ours, don't touch). Turning ufw on would mean picking a default policy
# for the *whole* server, and getting that wrong risks locking out SSH or breaking those
# other apps. So this touches nothing but port 8800: plain iptables rules, scoped to that
# one port, appended to INPUT without changing its default ACCEPT policy. Everything else
# on the box keeps working exactly as before.
#
# **Why delete-then-re-add instead of check-then-append:** iptables evaluates INPUT rules
# in order and stops at the first match. If a future edit appends a new ACCEPT range after
# the catch-all DROP is already in place, that new rule would be dead — the DROP above it
# already claims all port-8800 traffic. Wiping our own port-8800 rules and rebuilding them
# in the right order every run makes this safe to re-run indefinitely, including when the
# IP list below changes.
#
# **Persistence across reboot:** these are runtime iptables rules, not saved to disk by
# default, and this server has no reboot-persistence package installed for iptables. This
# script itself is what's idempotent, so it also runs from a `@reboot` cron line (see
# deploy.yml) — a reboot with no deploy after it must not leave port 8800 exposed to the
# whole internet with no rules at all.
set -e

PORT=8800

# ArvanCloud's own published CDN edge IPv4 ranges — fetched from
# https://www.arvancloud.ir/en/ips.txt by the owner directly (that URL blocks automated
# fetches from this project's CI/agent environment) on 1405/06/24 (2026-09-15). This list
# can change on ArvanCloud's side; re-fetch and update here if origin traffic ever stops
# reaching the server after a legitimate ArvanCloud-side change.
CIDRS=(
  "185.143.232.0/22"
  "188.229.116.16/30"
  "94.101.182.0/27"
  "2.144.3.128/28"
  "37.32.16.0/27"
  "37.32.17.0/27"
  "37.32.18.0/27"
  "37.32.19.0/27"
  "185.215.232.0/22"
  "178.131.120.48/28"
  "94.101.183.0/28"
  "78.157.36.112/28"
  "95.38.61.80/28"
  "193.24.119.0/29"
)

# Wipe only our own port-8800 rules (never touches anything on another port).
while sudo iptables -D INPUT -p tcp --dport "$PORT" -j DROP 2>/dev/null; do :; done
while sudo iptables -D INPUT -i lo -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; do :; done
for cidr in "${CIDRS[@]}"; do
  while sudo iptables -D INPUT -p tcp --dport "$PORT" -s "$cidr" -j ACCEPT 2>/dev/null; do :; done
done

# Rebuild in the correct order: loopback first, then every allowed range, the catch-all
# DROP last. The DROP rule matches by destination port alone (no `-s`), so without this it
# also swallows 127.0.0.1 traffic -- which is exactly what deploy.yml's own health check
# uses right after this script runs, on every single deploy. Found by that health check
# failing and rolling back reproducibly (~150s of hung curl retries against a port that was
# silently dropping every packet), not by inspection.
sudo iptables -A INPUT -i lo -p tcp --dport "$PORT" -j ACCEPT
for cidr in "${CIDRS[@]}"; do
  sudo iptables -A INPUT -p tcp --dport "$PORT" -s "$cidr" -j ACCEPT
done
sudo iptables -A INPUT -p tcp --dport "$PORT" -j DROP

echo "فایروال پورت $PORT: ${#CIDRS[@]} رنج آروان مجاز، بقیه رد می‌شوند"
sudo iptables -L INPUT -n -v --line-numbers | grep -E "dpt:$PORT" || true
