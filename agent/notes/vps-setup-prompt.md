# Мастер-промт настройки VPS для live-бота (paperhands)

> Session 2 (2026-07-05). Готовый промт для вставки в **Claude CLI на свежем VPS**.
> Собран воркфлоу (4 исследователя + сборка) и прошёл adversarial security/SRE-ревью.
> Рекомендованный хост: **Vultr Токио** (или Сингапур), **2 vCPU / 4 GB / 80 GB**, Ubuntu 24.04 LTS.
> Полный чеклист live-готовности — [live-readiness-checklist.md](live-readiness-checklist.md).
>
> **Как пользоваться:** прочитай раздел «Найденные бреши» (контекст — почему так), затем
> скопируй мастер-промт (со «Стадии 0» и ниже) и вставь в `claude` на сервере. Все секреты —
> плейсхолдеры `<...>`, заполняешь на хосте. **Брокер остаётся ОТКЛЮЧЁН, реальные ключи и
> первый $100 — только после зелёных гейтов OOS+paper и явного go владельца.**

---

Confirmed the load-bearing facts. Two are outright bugs in the draft. Below: the adversarial findings, then the complete corrected master prompt.

---

## Найденные бреши (adversarial review)

**Критические (ломают безопасность или сам прогон):**

1. **`MODE=brokerdebug` невалиден.** `entrypoint.sh` принимает только `backtest|live|paper|walker` и падает на любом другом `MODE`. Broker-dry-run работает лишь потому, что при переданных аргументах (`--brokerdebug ...`) entrypoint уходит в ветку `exec node "$@"` и `MODE` игнорирует. Значит `-e MODE=brokerdebug` — мёртвый и вводящий в заблуждение; убран.
2. **`SYMBOL` по умолчанию = `BTCUSDT`.** Если забыть `SYMBOL`, бот молча стартует на BTCUSDT. Сделал `SYMBOL` обязательным с явной проверкой.
3. **Контейнер работает под root** (в `Dockerfile` нет `USER`; база `node:22-alpine`). Третьесторонний образ, который позже будет держать live-ключи Binance, крутится как root. Добавил `no-new-privileges`, `cap_drop: ALL`, лимиты памяти/pids, read-only-эксперимент, и egress-allowlist для go-live.
4. **Docker в обход UFW (DOCKER-USER).** Публикация порта пишет правила в цепочку `DOCKER`, минуя `INPUT`/UFW. Loopback-биндинг `127.0.0.1:60050` — единственная реальная защита UI, и одна опечатка (`60050:60050`) выставит дашборд в интернет мимо UFW. Добавил жёсткие правила `DOCKER-USER` (default-drop с внешних интерфейсов) как defense-in-depth + verify.
5. **fail2ban на Ubuntu 24.04 тихо не работает.** По умолчанию нет rsyslog/`/var/log/auth.log` → дефолтный `sshd`-jail не находит лог и молча простаивает. Нужен `backend = systemd`. Исправлено.
6. **Supply-chain: третьесторонний образ + `docker.sock` у autoheal.** Образ `tripolskypetr/backtest-kit` и `willfarrell/autoheal` тянутся с Docker Hub; autoheal монтирует `docker.sock` = root на хосте. Пиннинг по digest, харднинг обоих контейнеров, и явное предупреждение владельцу.

**Существенные:**

7. **Маскирование секретов слишком узкое** — `sed 's/SECRET=.../'` не скрывает `API_KEY`, `TOKEN`. Расширил маску на KEY|SECRET|TOKEN|PASS.
8. **Гео-проверка была последней (Стадия 8)** — если IP заблокирован (451), вся настройка впустую. Вынес pre-flight гео/arch-проверку в Стадию 0.
9. **Незапиненный образ** — сток `:latest`/без тега. Пиннинг по digest (тег мутабелен), команда получения digest.
10. **sshd-конфиг проверяется по файлу, а не по эффекту.** Cloud-init кладёт `50-cloud-init.conf` с `PasswordAuthentication yes`; проверять надо `sshd -T`, а не наличие drop-in. Добавил verify через `sshd -T`.
11. **Нет драйва восстановления после ребута хоста** — только `docker kill`. Добавил reboot-drill (контейнеры поднимаются сами).
12. **`newgrp docker` / `sudo reboot` роняют SSH-сессию агента** — CLI-агент может счесть это фейлом. Явные предупреждения о переподключении; замена `newgrp` на re-login/`sg`.
13. **Неоднозначность SSH-порта** — `Port 22` закомментирован, а jail.local хардкодит 22; агент может рассинхронить sshd/UFW/fail2ban → локаут. Зафиксировал одно значение сквозняком с явным правилом «менять во всех трёх местах разом».
14. **`start_period`/autoheal слишком короткие** — холодный первый старт (сборка TS, докачка свечей) может превысить 60s → autoheal-петля. Поднял до 180s и согласовал autoheal.
15. **Нет лимитов ресурсов** — один контейнер может съесть RAM → OOM в момент сделки. Добавил `mem_limit`, `pids_limit`.
16. **Реальные Ollama/Tavily токены** — откуда на свежем хосте? Явно: владелец передаёт вне git, агент не выдумывает; заглушки иначе.
17. **История shell и `getUpdates` палят токены** — токен в URL/`ps`/history. Гигиена истории + маскирование.
18. **Скан git-истории форка на закоммиченные секреты** — форк мог тащить `.env` в прошлом. Добавил проверку.
19. **Нет heartbeat / dead-man-switch помимо событий** — Telegram шлёт только на open/close/fill; молчащий мёртвый бот незаметен. Добавил cron-heartbeat на `health`.
20. **`env_file` + `environment` без значений** — если `SYMBOL/STRATEGY_FILE` не в shell-env, они не прокинутся; сделал запуск через явные `-e`/inline и проверку.

**Мелкие:** IPv6-Docker заметка; auto-reboot 04:00 vs live-позиция (для live отключить); бэкапы не offsite/не шифрованы; `timedatectl set-ntp` избыточен при chrony; egress широко открыт (для key-box сузить).

---

# ФИНАЛЬНЫЙ МАСТЕР-ПРОМПТ (вставить целиком в Claude CLI на свежем VPS)

Ты — DevOps/SRE-инженер, настраивающий свежий Ubuntu-24.04-VPS под торгового бота **paperhands** (форк `backtest-kit`, запуск через Docker, образ `tripolskypetr/backtest-kit`). Работай строго по стадиям. Комментируй по-русски, команды выполняй в English-shell. После каждой стадии кратко подтверждай результат проверкой. **Не переходи к следующей стадии, пока текущая не проверена.** Если проверка не прошла — остановись, сообщи владельцу, не продолжай.

## ЖЁСТКИЕ ПРАВИЛА БЕЗОПАСНОСТИ (не нарушать никогда)
1. **Это ТОЛЬКО подготовка инфраструктуры.** Брокер-адаптер / `live.module` ещё НЕ написан, ни одна стратегия НЕ прошла OOS-гейт + paper. Брокер остаётся ОТКЛЮЧЁННЫМ, режим — только `MODE=paper` (или `backtest`). **НИКОГДА не ставь `MODE=live` в этом промпте.**
2. **НИКАКИХ реальных ключей Binance и НИКАКИХ средств.** В `.env` для Binance пишем только `<PLACEHOLDER>`. Реальные trade-ключи создаёт владелец вручную позже (Phase 5), после зелёных гейтов и письменного одобрения. Первый live-размер = $100, позиции суб-$100.
3. **Секреты не печатать.** Никогда `echo`/`cat` секретов, `env`, `printenv`, `docker inspect backtest`, `docker compose config` без маскирования. Маска — всегда: `sed -E 's/((KEY|SECRET|TOKEN|PASS)[A-Z_]*=).*/\1REDACTED/I'`.
4. **UI (60050) НИКОГДА не публичный.** Только loopback-биндинг `127.0.0.1:60050:60050` + SSH-туннель. Не открывать 60050 ни в UFW, ни в облачном фаерволе, ни в `DOCKER-USER`.
5. **`.env` НИКОГДА не коммитить.** `git check-ignore` перед записью любого секрета; `git status` по `.env` должен быть пуст.
6. **Инвариант look-ahead неприкосновенен.** `src/**` не трогаем — это чисто хостовая/инфра-настройка.
7. **Гигиена секретов в shell.** Перед вводом любой команды с токеном выполни `export HISTCONTROL=ignorespace` и начинай такую команду с ПРОБЕЛА, чтобы она не попала в history. Токены не передавай в URL, где видно в `ps` — только через `--data-urlencode`/переменные окружения.
8. **Опасные необратимые шаги — только со страховочной сессией.** Отключение паролей SSH, `reboot`, рестарт `ssh` — держи ОТКРЫТОЙ вторую SSH-сессию как страховку от локаута. `reboot` и `newgrp`/re-login РАЗОРВУТ твою текущую сессию — это ОЖИДАЕМО, а не ошибка: дождись доступности хоста и переподключись, затем продолжай со следующего шага.

---

## СТАДИЯ 0 — Предпосылки, допущения и PRE-FLIGHT (гео + arch — ДО любой работы)
- ОС: свежая Ubuntu 24.04 LTS. Регион VPS — Токио или Сингапур (**НЕ США/ЕС-где-блок**; Binance.com отдаёт 451 в США). Провайдер с фиксированным/reserved IP (Vultr/Linode).
- Ресурсы: минимум 1 vCPU / 2 GB / 30 GB SSD; рекомендуется 2 vCPU / 4 GB / 50–80 GB. GPU не нужен (AI удалённый: Ollama Cloud + Tavily).
- Зафиксируй имена сквозняком (используй ровно эти значения дальше):
  - `SERVER_IP` = `<IP_СЕРВЕРА>`
  - `SSH_PORT` = `22`. **Если меняешь на 2222 — меняй СОГЛАСОВАННО в трёх местах: `sshd_config.d/99-hardening.conf` (`Port`), UFW-правиле и `fail2ban jail.local` (`port`). Рассинхрон = локаут. По умолчанию оставь 22.**
  - Пользователь-деплой: `deploy`.
  - `REPO_URL` = `<GIT_URL_highscrren-dotcom/paperhands>`.

**[0.1] Базовая инвентаризация + архитектура (образ — `linux/amd64`; на ARM-VPS будет QEMU-эмуляция и тормоза):**
```bash
whoami && lsb_release -a && uname -rm && free -h && df -h /
```
Если `uname -m` показывает `aarch64`/`arm64` — ОСТАНОВИСЬ и сообщи владельцу: образ собран под amd64, нужен x86_64-VPS.

**[0.2] PRE-FLIGHT гео-проверка Binance (иначе вся настройка впустую):**
```bash
curl -sS -o /dev/null -w "ping=%{http_code} time=%{http_code}\n" https://api.binance.com/api/v3/ping
curl -sS -o /dev/null -w "geo=%{http_code}\n" https://api.binance.com/api/v3/time
echo "egress_ip=$(curl -s https://api.ipify.org)"
```
Ожидаем `200`. Любой `451`/`403` = гео-блок → **СТОП, сменить регион/VPS (Токио/Сингапур), не продолжать.**

---

## СТАДИЯ 1 — Хардненинг ОС

**[1.0] Полное обновление и ребут (первым делом).**
```bash
sudo apt update && sudo apt -y full-upgrade && sudo apt -y autoremove && sudo reboot
```
Твоя SSH-сессия оборвётся — это нормально. Переподключись после ребута и продолжай на пропатченной системе.

**[1.1] Непривилегированный sudo-пользователь `deploy`.**
```bash
sudo adduser deploy          # СИЛЬНЫЙ пароль (только для sudo, не для SSH)
sudo usermod -aG sudo deploy
id deploy                    # должна быть группа sudo
```
Passwordless sudo — по умолчанию НЕ включаем (безопаснее запрашивать пароль). Включать только осознанно:
`echo 'deploy ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/deploy && sudo chmod 440 /etc/sudoers.d/deploy`.

**[1.2] SSH-ключ для `deploy` — ДО отключения паролей (иначе локаут).**
На ЛОКАЛЬНОЙ машине (если ключа нет): `ssh-keygen -t ed25519 -C paperhands-deploy`, затем `ssh-copy-id deploy@SERVER_IP`. Либо вручную:
```bash
sudo mkdir -p /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh
# вставить публичный ключ в /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
```
Открой ВТОРОЙ терминал и убедись, что `ssh deploy@SERVER_IP` заходит по ключу, пока первая (root) сессия открыта как страховка.

**[1.3] Хардненинг sshd (drop-in, переживает апгрейды).**
```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf > /dev/null <<'EOF'
# --- Auth: keys only, no root, no passwords ---
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
PermitEmptyPasswords no
AuthenticationMethods publickey
AllowUsers deploy
# Port 22   # если меняешь на 2222 — согласуй с UFW и fail2ban (см. Стадия 0)
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding yes        # НУЖНО для SSH-туннеля к UI :60050
MaxAuthTries 3
MaxSessions 4
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sudo sshd -t                          # валидация: тишина = ок
# ВАЖНО: проверяем ЭФФЕКТИВНЫЙ конфиг (cloud-init кладёт 50-cloud-init.conf с PasswordAuthentication yes)
sudo sshd -T | grep -Ei 'permitrootlogin|passwordauthentication|pubkeyauthentication|authenticationmethods|allowusers'
# ожидаем: permitrootlogin no / passwordauthentication no / pubkeyauthentication yes / authenticationmethods publickey / allowusers deploy
sudo systemctl restart ssh.socket && sudo systemctl restart ssh   # 24.04 socket-activated
```
Если `sshd -T` показал `passwordauthentication yes` — есть конфликтующий drop-in с бОльшим приоритетом; найди его (`grep -rn PasswordAuthentication /etc/ssh/sshd_config /etc/ssh/sshd_config.d/`) и переопредели, иначе пароли не отключены.
Из НОВОГО терминала: вход по ключу работает, а `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password deploy@SERVER_IP` — ОТКЛОНЁН. Только потом закрывай страховочную root-сессию.

**[1.4] UFW: default-deny inbound, разрешён только SSH; 60050 НЕ открываем.**
```bash
sudo apt -y install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing         # egress: Binance, Ollama, Tavily, Telegram, apt, ntp, Docker Hub
sudo ufw limit 22/proto tcp comment 'ssh (rate-limited)'   # если менял SSH_PORT — здесь тоже
sudo ufw --force enable
sudo ufw status verbose
```
**НЕ выполняй `ufw allow 60050`.** Правило SSH добавлено ДО enable. Учти: UFW НЕ управляет Docker-портами (см. [2.6]).

**[1.5] fail2ban против брутфорса SSH.**
```bash
sudo apt -y install fail2ban
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
# Ubuntu 24.04: нет rsyslog/auth.log по умолчанию -> ОБЯЗАТЕЛЬНО systemd-бэкенд,
# иначе jail молча простаивает (не находит лог).
backend = systemd
bantime.increment = true

[sshd]
enabled = true
mode = aggressive
port = 22
maxretry = 4
findtime = 10m
bantime = 1h
EOF
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd      # Currently failed / Total banned — jail ЖИВОЙ, не 0-конфиг
sudo journalctl -u fail2ban --no-pager | tail -n 5   # без ошибок "Failed to access socket"/no logs
```
(Если менял SSH_PORT — поставь его в `port`.)

**[1.6] Автоматические security-патчи (unattended-upgrades).**
```bash
sudo apt -y install unattended-upgrades apt-listchanges needrestart
sudo dpkg-reconfigure -plow unattended-upgrades
# /etc/apt/apt.conf.d/20auto-upgrades: Update-Package-Lists "1"; Unattended-Upgrade "1";
# /etc/apt/apt.conf.d/50unattended-upgrades:
#   Unattended-Upgrade::Automatic-Reboot "true";
#   Unattended-Upgrade::Automatic-Reboot-Time "04:00";
sudo unattended-upgrades --dry-run --debug 2>&1 | tail -n 20
```
`restart: always` + персист в `./dump/data` делают ночной ребут безопасным. **Для go-live (Phase 5) авто-ребут желательно отключить или сместить на окно без активных позиций** — записано в Стадии 9.

**[1.7] Точное время через chrony (КРИТИЧНО для ccxt/Binance HMAC).**
```bash
sudo apt -y install chrony
sudo systemctl enable --now chrony
sudo timedatectl set-timezone UTC
chronyc tracking       # System time offset — единицы миллисекунд
chronyc sources -v     # хотя бы один источник ^*
timedatectl status | grep -i 'System clock synchronized'   # yes
```
chrony автоматически отключает systemd-timesyncd (должен остаться РОВНО один NTP-демон: `systemctl is-active systemd-timesyncd` → `inactive`/`masked`). Перекос часов = отклонённые ордера (`-1021`).

**[1.8] Swap (защита от OOM-kill в момент сделки).**
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
printf 'vm.swappiness=10\nvm.vfs_cache_pressure=50\n' | sudo tee /etc/sysctl.d/99-swap.conf
sudo sysctl --system
swapon --show && free -h
```

**[1.9] Ограничение роста логов (полный диск стопорит атомарные записи в ./dump/data).**
```bash
sudo tee -a /etc/systemd/journald.conf > /dev/null <<'EOF'
SystemMaxUse=200M
SystemMaxFileSize=50M
MaxRetentionSec=1month
Storage=persistent
EOF
sudo systemctl restart systemd-journald
```
Логи Docker ограничим на Стадии 2 (daemon.json) и в compose.

---

## СТАДИЯ 2 — Установка Docker (Engine + compose v2) + firewall-гэп
```bash
# 1. Убрать distro/snap Docker
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null; sudo snap remove docker 2>/dev/null; true
# 2. Ключ и репозиторий Docker
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
# 3. Engine + compose v2
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
# 4. Автозапуск (важно для восстановления после ребута хоста)
sudo systemctl enable --now docker
# 5. Кап логов Docker
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
EOF
sudo systemctl restart docker
# 6. deploy в группу docker
sudo usermod -aG docker deploy
# 7. Проверка (перелогинься под deploy, чтобы группа docker применилась; newgrp порвёт неинтерактивную сессию)
docker --version && docker compose version
sudo -u deploy sg docker -c 'docker run --rm hello-world'
```
Примечание: членство в группе `docker` = фактически root на хосте. Это ожидаемо для деплой-пользователя; никого больше в группу не добавляй.

**[2.6] ЗАКРЫТЬ Docker↔UFW-гэп (Docker пишет правила в цепочку `DOCKER`, минуя UFW-INPUT).**
Даже при default-deny UFW опубликованный на `0.0.0.0` порт был бы доступен из интернета. UI мы биндим на loopback (Стадия 4) — это главная защита, но добавляем defense-in-depth: правило в `DOCKER-USER`, дропающее внешний трафик к контейнерам, кроме established. Определи внешний интерфейс и примени:
```bash
EXT_IF=$(ip route show default | awk '/default/ {print $5; exit}'); echo "EXT_IF=$EXT_IF"
sudo tee /etc/docker-user-firewall.sh > /dev/null <<EOF
#!/bin/sh
EXT_IF="$EXT_IF"
iptables -I DOCKER-USER -i \$EXT_IF -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -I DOCKER-USER -i \$EXT_IF -j DROP
EOF
sudo chmod +x /etc/docker-user-firewall.sh
sudo tee /etc/systemd/system/docker-user-firewall.service > /dev/null <<'EOF'
[Unit]
Description=Restrict external access to Docker published ports (DOCKER-USER)
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/etc/docker-user-firewall.sh
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now docker-user-firewall.service
sudo iptables -S DOCKER-USER      # видны наши RETURN(established)+DROP на внешнем интерфейсе
```
(Правила висят в `DOCKER-USER` независимо от UFW и переживают ребут через сервис. Loopback-трафик и SSH идут мимо этой цепочки — не затрагиваются.) Если хост IPv6-включён, продублируй `ip6tables` теми же двумя правилами или отключи IPv6 у Docker в `daemon.json` (`"ip6tables": false`).

---

## СТАДИЯ 3 — Рабочая директория (workspace)
Клонируем НАШ репозиторий (в нём наши стратегии, OOS-слой, modules). Скаффолд `--docker` даёт пустой демо-workspace — НЕ подходит.
```bash
cd /home/deploy
git clone REPO_URL paperhands
cd /home/deploy/paperhands/example        # ЭТО workspace (content/ logic/ config/ modules/)
```
**Скан истории форка на закоммиченные секреты (форк мог тащить .env/ключи):**
```bash
cd /home/deploy/paperhands
git log --all -p -- '*.env' 2>/dev/null | grep -iE '(api[_-]?key|secret|token)=' | head || echo "no secrets in tracked .env history"
git grep -iE 'BINANCE_API_(KEY|SECRET)=[A-Za-z0-9]' $(git rev-list --all) 2>/dev/null | head || echo "no hardcoded binance keys"
```
Если что-то нашлось — СТОП, сообщи владельцу (нужна ротация ключей/чистка истории), не продолжай с этими ключами.
Скопируй compose в корень workspace (bind-mount как `/workspace`):
```bash
cd /home/deploy/paperhands/example
cp ../cli/docker/docker-compose.yaml ./docker-compose.yaml
```
Убедись, что клон на ПЕРСИСТЕНТНОМ диске (не tmpfs): `df -T /home/deploy/paperhands | tail -1` — не `tmpfs`/`overlay`-в-RAM. `./dump/data` пишется на хост-диск и переживает пересоздание контейнера.

---

## СТАДИЯ 4 — docker-compose: надёжность + харднинг third-party образа
**Полностью замени** `example/docker-compose.yaml` на конфиг ниже. Отличия от стока: loopback-биндинг UI, `restart: always`, пиннинг **по digest**, ротация логов, `stop_grace_period`, лимиты ресурсов, `no-new-privileges` + `cap_drop: ALL` (образ штатно работает под root — снижаем поверхность), autoheal-sidecar. Образ `tripolskypetr/backtest-kit` — третьесторонний и ПОЗЖЕ будет держать live-ключи Binance: пиннинг по digest и харднинг обязательны.

Сначала получи digest и подставь его вместо `<PINNED_DIGEST>`:
```bash
docker pull tripolskypetr/backtest-kit:14.1.0
docker inspect --format '{{index .RepoDigests 0}}' tripolskypetr/backtest-kit:14.1.0
# пример вывода: tripolskypetr/backtest-kit@sha256:....  — используй ЭТУ строку в image:
docker pull willfarrell/autoheal:1.2.0
docker inspect --format '{{index .RepoDigests 0}}' willfarrell/autoheal:1.2.0
```
```yaml
services:
  backtest:
    image: tripolskypetr/backtest-kit@sha256:<PINNED_DIGEST>   # ПИННИНГ ПО DIGEST. НИКОГДА :latest.
    platform: linux/amd64
    container_name: backtest
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "127.0.0.1:60050:60050"     # UI ТОЛЬКО loopback — доступ через SSH-туннель
    restart: always
    stop_grace_period: 120s         # SIGTERM -> node дренирует позиции (entrypoint делает exec). НИКОГДА kill -9.
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    mem_limit: 1500m
    pids_limit: 512
    volumes:
      - ./:/workspace               # персистентный bind-mount: ./dump/data переживает рестарты
    working_dir: /workspace
    env_file:
      - .env
    environment:
      - MODE
      - STRATEGY_FILE
      - SYMBOL
      - STRATEGY
      - EXCHANGE
      - FRAME
      - UI
      - TELEGRAM
      - VERBOSE
      - NO_CACHE
      - NO_FLUSH
      - ENTRY
    labels:
      - "autoheal=true"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:60050/api/v1/health/health_check"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 180s            # холодный первый старт (сборка TS + докачка свечей) может быть долгим
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"

  autoheal:
    image: willfarrell/autoheal@sha256:<PINNED_DIGEST_AUTOHEAL>
    container_name: autoheal
    restart: always
    security_opt:
      - no-new-privileges:true
    environment:
      - AUTOHEAL_CONTAINER_LABEL=autoheal
      - AUTOHEAL_INTERVAL=15
      - AUTOHEAL_START_PERIOD=180
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro   # даёт autoheal контроль над Docker = фактически root на хосте. Осознанный компромисс ради health-restart.
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```
**КРИТИЧНО:**
- Healthcheck/autoheal бьют в :60050, который существует только при запущенном UI. `UI` в образе по умолчанию `=1`, но **ВСЕГДА передавай `UI=1` явно.** Если когда-либо запускаешь без UI — сначала убери healthcheck + label `autoheal=true`, иначе вечный «unhealthy» → autoheal-петля рестартов.
- `curl` в образе есть (база `node:22-alpine` + `apk add curl`), healthcheck рабочий — но подтверди после старта: `docker exec backtest which curl`.
- `cap_drop: ALL`/`no-new-privileges` не должны ломать сеть (исходящие соединения не требуют CAP). Если контейнер после старта не ходит в сеть — сними ограничения по одному и зафиксируй причину владельцу, не отключай молча.

Проверка синтаксиса (с широкой маской секретов):
```bash
docker compose config | sed -E 's/((KEY|SECRET|TOKEN|PASS)[A-Z_]*[:=]).*/\1REDACTED/I' | head -n 60
```

---

## СТАДИЯ 5 — .env с PLACEHOLDER-секретами + права
```bash
cd /home/deploy/paperhands/example
# .gitignore ПЕРВЫМ, потом файл — fail-safe:
grep -qxF '.env' .gitignore || echo '.env' >> .gitignore
git check-ignore -v .env      # ДОЛЖЕН напечатать путь (exit 0). Нет пути — СТОП, не писать секреты.
cp .env.example .env 2>/dev/null || touch .env
```
Запиши в `.env` (Binance — заглушки; реальные вставит владелец позже). **Реальные `OLLAMA_TOKEN`/`TAVILY_TOKEN`/Telegram владелец передаёт вне git (не выдумывай их); если их нет — оставь заглушки и отметь это владельцу.**
```dotenv
# --- AI (реальные значения владелец передаёт вне git; иначе заглушки) ---
OLLAMA_TOKEN=<OLLAMA_TOKEN>
TAVILY_TOKEN=<TAVILY_TOKEN>

# --- Binance SPOT trade-ключи (владелец заполняет НА ХОСТЕ в go-live; сейчас — заглушки) ---
# Reading + Spot Trading ONLY. Withdrawals OFF. Futures OFF. IP-whitelist на egress-IP VPS.
BINANCE_API_KEY=__FILL_ON_HOST_AT_GO_LIVE__
BINANCE_API_SECRET=__FILL_ON_HOST_AT_GO_LIVE__

# --- Telegram-алерты (--telegram; нужны ОБА, иначе провайдер отключается) ---
CC_TELEGRAM_TOKEN=<CC_TELEGRAM_TOKEN>
CC_TELEGRAM_CHANNEL=<CC_TELEGRAM_CHANNEL>

# --- Dashboard: только loopback, никогда 0.0.0.0 ---
CC_WWWROOT_HOST=127.0.0.1
CC_WWWROOT_PORT=60050

# Опционально (если используются Redis/Mongo):
# CC_REDIS_HOST=host.docker.internal
# CC_MONGO_CONNECTION_STRING=mongodb://host.docker.internal:27017/backtest-kit?wtimeoutMS=15000
```
Права и подтверждение:
```bash
chown deploy:deploy .env && chmod 600 .env
chmod 700 /home/deploy/paperhands/example
stat -c '%a %U %n' .env               # ожидаем: 600 deploy .env
git status --porcelain .env           # ПУСТО
chmod 600 /home/deploy/.ssh/authorized_keys
```
Реальные Binance-ключи на этой стадии НЕ создаём и НЕ вставляем.

---

## СТАДИЯ 6 — Telegram-алерты + UI только через SSH-туннель

**Telegram (пейджер на open/close/fill).** `--telegram` (`TELEGRAM=1`), нужны ОБА `CC_TELEGRAM_TOKEN` и `CC_TELEGRAM_CHANNEL`.
1. @BotFather → `/newbot` → токен = `CC_TELEGRAM_TOKEN`.
2. Chat id: напиши боту `/start`, затем (токен в env, не в URL/history — команда с ведущим пробелом):
```bash
 export TG=<CC_TELEGRAM_TOKEN>
 curl -s "https://api.telegram.org/bot${TG}/getUpdates" | grep -o '"chat":{"id":[0-9-]*'
```
Личный чат — положительное число; канал/группа — отрицательное `-100…` (бот — админ).
3. Смоук-тест:
```bash
 curl -s "https://api.telegram.org/bot${TG}/sendMessage" \
  --data-urlencode "chat_id=<CC_TELEGRAM_CHANNEL>" \
  --data-urlencode "text=paperhands alert test $(date -u)"
 unset TG
```
Сообщение должно прийти. Telegram-токен — тоже секрет (в `.env`, chmod 600, не в логи/history).

**UI — только SSH-туннель.** Публикация уже loopback (`127.0.0.1:60050:60050`). С ноутбука владельца:
```bash
ssh -N -L 60050:127.0.0.1:60050 deploy@SERVER_IP    # затем http://localhost:60050
```
Docker пишет iptables в обход UFW-INPUT — гарантия приватности UI это (а) loopback-биндинг и (б) правило `DOCKER-USER` из [2.6]. Проверка — Стадия 8.3.

**[6.1] Heartbeat / dead-man-switch (Telegram шлёт только на события — молчащий мёртвый бот незаметен).**
Cron у `deploy`: раз в 15 мин проверяет health контейнера и пингует Telegram при проблеме.
```bash
 export TG=<CC_TELEGRAM_TOKEN>; CH=<CC_TELEGRAM_CHANNEL>
 mkdir -p /home/deploy/bin
 cat > /home/deploy/bin/heartbeat.sh <<EOF
#!/bin/sh
H=\$(docker inspect -f '{{.State.Health.Status}}' backtest 2>/dev/null || echo missing)
if [ "\$H" != "healthy" ]; then
  curl -s "https://api.telegram.org/bot${TG}/sendMessage" --data-urlencode "chat_id=${CH}" --data-urlencode "text=[paperhands] backtest health=\$H on $(hostname) $(date -u)" >/dev/null
fi
EOF
 chmod 700 /home/deploy/bin/heartbeat.sh
 ( crontab -l 2>/dev/null; echo '*/15 * * * * /home/deploy/bin/heartbeat.sh' ) | crontab -
 unset TG CH
```
(Скрипт содержит токен — `chmod 700`, владелец `deploy`. Опционально: раз в сутки слать «alive», чтобы отличать «всё ок» от «cron умер».)

---

## СТАДИЯ 7 — Запуск в БЕЗОПАСНОМ режиме + broker dry-run
Все команды из `example/`. Режим — **только paper**. `SYMBOL` **обязателен** (иначе entrypoint молча возьмёт дефолт `BTCUSDT`). `UI=1` обязателен.
```bash
cd /home/deploy/paperhands/example
# Явная проверка, что переменные заданы (не полагаемся на дефолты entrypoint):
: "${STRATEGY_FILE:?set STRATEGY_FILE}"; : "${SYMBOL:?set SYMBOL}"
MODE=paper \
STRATEGY_FILE=./content/<strat>/<strat>.strategy.ts \
SYMBOL=<SYM> \
UI=1 TELEGRAM=1 \
docker compose up -d

docker compose ps                       # STATUS: (healthy) — дай до 180s (start_period)
docker exec backtest which curl         # curl есть -> healthcheck рабочий
docker compose logs --tail=200 backtest
docker inspect --format '{{json .State.Health}}' backtest
docker compose logs --tail=50 autoheal  # sidecar видит healthy, БЕЗ рестарт-петли
```
**Broker dry-run (реальных ордеров НЕ шлёт — только логика хука).** ВНИМАНИЕ: `MODE=brokerdebug` НЕВАЛИДЕН для entrypoint; передаём флаги как аргументы (тогда entrypoint уходит в ветку `exec node "$@"` и MODE игнорирует):
```bash
docker compose run --rm backtest --brokerdebug --commit signal-open --symbol <SYM>
```
ЛОВУШКА (live-readiness-checklist): если `onOrderOpenCommit` не реализован, `BrokerProxy` логирует warning и ПРОПУСКАЕТ open как no-op — сделка «проходит» без ордера. Чистый dry-run обязан показывать РЕАЛЬНЫЙ вызов хука, а не skip-warning. Адаптера пока нет — это ОЖИДАЕМО: фиксируем факт, брокер НЕ включаем.

Бэкап состояния (перед каждым апдейтом; `./dump` на хосте):
```bash
mkdir -p /home/deploy/backups
tar czf /home/deploy/backups/dump-$(date +%Y%m%d-%H%M%S).tar.gz -C "$(pwd)" dump
```
Опциональный ночной cron бэкапа:
```bash
# 0 3 * * * cd /home/deploy/paperhands/example && tar czf /home/deploy/backups/dump-$(date +\%Y\%m\%d).tar.gz dump && find /home/deploy/backups -name 'dump-*.tar.gz' -mtime +14 -delete
```
(Бэкап содержит торговое состояние, не секреты. Для реального капитала — держи копию offsite/зашифрованной.)
Грациозный стоп/рестарт (НИКОГДА `docker kill`/`kill -9`):
```bash
docker compose stop backtest      # SIGTERM, до 120s на дренаж
docker compose up -d
```

---

## СТАДИЯ 8 — Верификация

**8.1 Binance geo-приём (хост И контейнер).**
```bash
curl -sS -o /dev/null -w "ping=%{http_code}\n" https://api.binance.com/api/v3/ping
curl -sS -o /dev/null -w "time=%{http_code}\n" https://api.binance.com/api/v3/time
docker exec backtest sh -c 'curl -sS -o /dev/null -w "in-container=%{http_code}\n" https://api.binance.com/api/v3/ping'
```
Все — `200`. `451`/`403` = гео-блок → СТОП.

**8.2 Синхронизация часов (расхождение с Binance < ~1s).**
```bash
timedatectl status | grep -i 'System clock synchronized'   # yes
chronyc tracking | grep 'System time'
echo "local=$(date +%s000)  binance=$(curl -s https://api.binance.com/api/v3/time | grep -o '[0-9]*')"
```

**8.3 UI НЕ доступен извне.**
С ЛОКАЛЬНОЙ машины: `nc -vz SERVER_IP 60050` — refused/timeout. На боксе:
```bash
sudo ss -tlnp | grep 60050        # ожидаем 127.0.0.1:60050, НИКОГДА 0.0.0.0:60050
sudo iptables -S DOCKER-USER | grep -E 'DROP|RETURN'   # правила [2.6] на месте
```

**8.4 Крэш → autoheal → восстановление позиций (брокер ОТКЛЮЧЁН).**
```bash
docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' backtest   # always
ls dump/data/                                    # signal/schedule/risk присутствуют
docker kill backtest                             # симуляция жёсткого крэша
sleep 25 && docker ps --filter name=backtest     # снова Up
docker logs --tail=50 backtest                   # перезагрузил pending signal + position map из dump/data
```

**8.5 Восстановление после РЕБУТА ХОСТА (ночной auto-reboot / падение провайдера).**
```bash
sudo reboot        # твоя SSH-сессия оборвётся — переподключись через ~60s
# после реконнекта:
docker ps --filter name=backtest --filter name=autoheal   # оба Up сами (docker enabled + restart: always)
docker logs --tail=30 backtest                             # состояние восстановлено из ./dump/data
```
Подтверди, что `./dump/data` переживает `docker compose down && up` (bind-mount на хост-диск).

**8.6 Секреты не утекают.**
```bash
docker compose config | sed -E 's/((KEY|SECRET|TOKEN|PASS)[A-Z_]*[:=]).*/\1REDACTED/I' | grep -iE 'binance|token'   # значения замаскированы
git status --porcelain .env       # пусто
history | grep -iE 'SECRET|TOKEN|API_KEY' || echo "history clean"
```
Авторизованный вызов Binance (`fetchBalance`) НЕ выполняем — только на go-live с READ-ONLY ключом и whitelisted IP.

---

## СТАДИЯ 9 — Что ОТЛОЖЕНО до go-live (Phase 5, НЕ делать сейчас)
Выполняется владельцем вручную ТОЛЬКО после: (a) стратегия прошла OOS/walk-forward гейт (verdict ≠ OVERFIT: OOS Sharpe ≥ 0 И return ≥ 0 И не проиграла buy&hold на ≥1 смежном месяце, через `agent/tools/oos-gate.mjs`); (b) многодневный paper-forward пережил UTC-rollover и рестарт/ребут хоста с неотрицательным результатом; (c) письменное одобрение владельца на конкретную стратегию + символ + размер.
- **Egress-allowlist для key-box (ужесточить):** на боксе, который держит live-ключи, сузь исходящий трафик до Binance/Ollama/Tavily/Telegram/apt/ntp вместо `allow outgoing all` — компрометированный контейнер иначе экфильтрует ключи куда угодно.
- **Re-pin образа по свежему digest** и пересмотри changelog перед обновлением (третьесторонний образ = supply-chain-риск для ключей).
- Создать Binance-ключ: **Reading + Spot Trading ТОЛЬКО; Withdrawals OFF/НИКОГДА; Futures OFF; Internal/Universal Transfer OFF; IP-whitelist на egress-IP VPS** (`curl -s https://api.ipify.org`). Секрет показывается один раз → вставить в `.env` на хосте, `chmod 600`.
- Сначала READ-ONLY ключ → `fetchBalance()` изнутри бокса (`AUTH OK`), затем апгрейд до Spot Trading.
- Брокер: `Broker.useBrokerAdapter(...)` + `Broker.enable()`; `addSizing` (фикс. малый размер + реальный `accountBalance`) и `addRisk` (лимит одновременных позиций, дедуп по символу) — ДО включения брокера.
- Откатить катастроф-кап: `CC_MAX_STOPLOSS_DISTANCE_PERCENT` ≤ 20 (в feb_2026 был 100).
- Уважать `MIN_NOTIONAL` (~5–10 USDT) и `LOT_SIZE`. Потолок первого live = $100, позиции суб-$100.
- **На время live отключи/сдвинь auto-reboot 04:00** (Стадия 1.6), чтобы ночной ребут не совпал с активной позицией; полагаться на `restart: always` + восстановление — но не на удачу.
- Только после чистого `--brokerdebug` (реальный вызов хука, не skip) и одобрения — `MODE=live`.
- Kill-switch: `Broker.disable()` и/или `docker compose stop backtest`, ПЛЮС удаление ключа в Binance API Management (мгновенный независимый off-switch). Деплой только `docker compose up -d`, никогда `kill -9`.

---

## ФИНАЛЬНЫЙ ЧЕК-ЛИСТ (подтвердить каждый пункт)
- [ ] Pre-flight (Стадия 0): arch = x86_64; Binance `/ping`,`/time` = 200 ДО настройки; зафиксирован egress-IP.
- [ ] Система пропатчена, ребут выполнен (1.0).
- [ ] `deploy` создан, в группе sudo; SSH-ключ работает.
- [ ] sshd: `sshd -T` показывает root no / password no / publickey; парольный вход ОТКЛОНЁН из нового терминала.
- [ ] UFW: default deny in / allow out; разрешён только SSH; 60050 НЕ открыт.
- [ ] fail2ban: `backend = systemd`, `status sshd` живой (не 0-конфиг), в журнале нет «no logs».
- [ ] unattended-upgrades настроен; авто-ребут 04:00 (для live — отложено/сдвинуто).
- [ ] chrony активен, TZ=UTC, offset — мс; ровно один NTP-демон (timesyncd inactive).
- [ ] Swap 2G в fstab; swappiness=10.
- [ ] journald и Docker-логи ограничены.
- [ ] Docker Engine + compose v2; `hello-world` под deploy прошёл.
- [ ] **DOCKER-USER firewall-сервис активен**; `iptables -S DOCKER-USER` содержит RETURN(established)+DROP на внешнем интерфейсе; переживает ребут.
- [ ] Репозиторий склонирован на персистентный диск; история просканирована на секреты (чисто); compose скопирован в `example/`.
- [ ] docker-compose: UI `127.0.0.1:60050`, `restart: always`, **пиннинг по digest**, ротация логов, `stop_grace_period: 120s`, `no-new-privileges`, `cap_drop: ALL`, `mem_limit`/`pids_limit`, `start_period: 180s`, autoheal-sidecar (тоже запинен).
- [ ] `.env`: Binance — только PLACEHOLDER; `chmod 600` deploy; `git check-ignore` печатает путь; `git status .env` пуст; каталог `example` — 700.
- [ ] Telegram: бот создан, chat id получен, смоук-тест доставлен (или оставлены заглушки); токен не в history/URL.
- [ ] Heartbeat-cron установлен (health→Telegram).
- [ ] UI только через SSH-туннель; `ss` → 127.0.0.1:60050; `nc` снаружи — refused.
- [ ] Бот в `MODE=paper` c `UI=1` и явным `SYMBOL`; статус `(healthy)`; `docker exec ... which curl` есть; autoheal без петли.
- [ ] `--brokerdebug` выполнен КАК АРГУМЕНТЫ (не `MODE=brokerdebug`); зафиксировано, что адаптер отсутствует/no-op, брокер НЕ включён.
- [ ] Binance geo: `/ping`,`/time` = 200 с хоста И из контейнера.
- [ ] Часы синхронизированы, расхождение с Binance < ~1s.
- [ ] Крэш-дрилл (`docker kill`) → авто-рестарт → восстановление из `./dump/data`.
- [ ] **Reboot-дрилл (`sudo reboot`)** → контейнеры поднимаются сами → состояние восстановлено.
- [ ] Секреты нигде не напечатаны; compose-вывод замаскирован (KEY|SECRET|TOKEN); `.env` не в git; history чист.
- [ ] ПОДТВЕРЖДЕНО: брокер ОТКЛЮЧЁН, реальных ключей/средств НЕТ, `MODE=live` НЕ использовался; всё из Стадии 9 отложено до одобрения владельца.

Если любой пункт не проходит — остановись, сообщи владельцу, не продолжай.