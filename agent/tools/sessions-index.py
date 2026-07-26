#!/usr/bin/env python3
"""Автоиндекс сессий Claude Code по умбрелле /home/s1dd1/dev/quant.

Зачем: транскрипты в ~/.claude/projects/ живут ~30 дней и названы UUID —
через месяц «где что делалось» восстановить не из чего. Скрипт вынимает из них
строку на сессию и джойнит по времени наши коммиты во всех форках умбреллы.

Три вещи, ради которых он написан именно так:

1. Кэш agent/tools/sessions-index.json — APPEND-ONLY. Сессия, чей транскрипт уже
   съеден ретенцией, остаётся в индексе навсегда. Кэш коммитится вместе с SESSIONS.md.
2. «Наши» коммиты = `--branches --not --remotes=upstream`, то есть то, чего нет у
   автора форка. Без этого в индекс лезут 269 коммитов tripolskypetr и 83 коммита
   HKUDS, приехавшие обычным fetch, и выдают себя за нашу работу.
3. Окна сессий перекрываются (одна сессия жила 9 дней поверх десятка коротких),
   поэтому коммит отдаётся САМОЙ УЗКОЙ сессии, которая его накрывает. Иначе один
   коммит считается по три раза и итог раздувается втрое.

Запуск:  python3 agent/tools/sessions-index.py [--dry-run]
Тема сессии перекрывается строкой в agent/tools/sessions-titles.tsv:
    <8 символов uuid><TAB><тема>

Зависимостей нет (stdlib), сеть не нужна.
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from glob import glob

UMBRELLA = "/home/s1dd1/dev/quant"
TRANSCRIPTS = os.path.expanduser("~/.claude/projects")
# все проектные директории умбреллы: сама умбрелла + сессии, стартовавшие внутри форков
TRANSCRIPT_GLOB = "-home-s1dd1-dev-quant*"

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "sessions-index.json")
TITLES = os.path.join(HERE, "sessions-titles.tsv")
OUT = os.path.abspath(os.path.join(HERE, "..", "SESSIONS.md"))

# сколько дней сессия считается «ещё живой» и перечитывается заново
REFRESH_DAYS = 2

# первые сообщения, из которых тема не получается — берём следующую строку
JUNK_PREFIXES = (
    "(request interrupted",
    "base directory for this skill",
    "caveat:",
    "[request interrupted",
)


def iso(ts):
    """'2026-07-25T08:56:11.123Z' -> datetime(tz=utc); None если не парсится."""
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def text_of(content):
    """Достаёт читаемый текст из message.content (str или список блоков)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


def first_prompt(path):
    """Первое содержательное сообщение владельца: не system-reminder, не tool_result,
    не обёртка слэш-команды, не служебная вставка харнесса."""
    for line in open(path, encoding="utf-8", errors="replace"):
        try:
            rec = json.loads(line)
        except (ValueError, TypeError):
            continue
        if rec.get("type") != "user":
            continue
        raw = text_of(rec.get("message", {}).get("content")).strip()
        if not raw or raw.startswith("<"):
            continue
        raw = re.sub(r"<system-reminder>.*?</system-reminder>", " ", raw, flags=re.S)
        for chunk in raw.splitlines():
            chunk = chunk.strip().lstrip("#").strip()
            if len(chunk) < 8 or chunk.lower().startswith(JUNK_PREFIXES):
                continue
            return chunk
    return ""


def scan_transcript(path):
    """Один проход по jsonl: окно времени, cwd, ветки, число реплик владельца."""
    stamps, cwds, branches, turns = [], {}, set(), 0
    for line in open(path, encoding="utf-8", errors="replace"):
        try:
            rec = json.loads(line)
        except (ValueError, TypeError):
            continue
        dt = iso(rec.get("timestamp"))
        if dt:
            stamps.append(dt)
        if rec.get("cwd"):
            cwds[rec["cwd"]] = cwds.get(rec["cwd"], 0) + 1
        br = rec.get("gitBranch")
        if br and br != "HEAD":
            branches.add(br)
        if rec.get("type") == "user":
            content = rec.get("message", {}).get("content")
            is_tool_result = isinstance(content, list) and any(
                isinstance(b, dict) and b.get("type") == "tool_result" for b in content
            )
            if not is_tool_result:
                turns += 1
    if not stamps:
        return None
    return {
        "start": min(stamps).isoformat(),
        "end": max(stamps).isoformat(),
        "cwd": max(cwds, key=cwds.get) if cwds else "",
        "branches": sorted(branches),
        "turns": turns,
        "title": first_prompt(path),
    }


def our_commits():
    """{repo: [(datetime, sha)]} — только НАШИ коммиты: то, что есть на локальных
    ветках и отсутствует у upstream. У репо без upstream-ремоута фильтр вырождается
    в «все локальные ветки», что и требуется."""
    out = {}
    for path in sorted(glob(os.path.join(UMBRELLA, "*"))):
        if not os.path.isdir(os.path.join(path, ".git")):
            continue
        name = os.path.basename(path)
        try:
            raw = subprocess.run(
                ["git", "-C", path, "log", "--branches", "--not", "--remotes=upstream",
                 "--no-merges", "--format=%H|%cI"],
                capture_output=True, text=True, timeout=120,
            ).stdout
        except (subprocess.SubprocessError, OSError) as exc:
            print(f"  ! {name}: git log не отработал ({exc})", file=sys.stderr)
            continue
        seen, rows = set(), []
        for line in raw.splitlines():
            sha, _, when = line.partition("|")
            dt = iso(when)
            if dt and sha not in seen:
                seen.add(sha)
                rows.append((dt, sha))
        if rows:
            out[name] = sorted(rows)
    return out


def attribute(commits, sessions):
    """Каждый коммит отдаём САМОЙ УЗКОЙ сессии, чьё окно его накрывает.

    Окна перекрываются: длинная возобновлённая сессия может накрывать десяток
    коротких. Без этого правила один коммит считался бы в каждой из них.
    Возвращает ({uid: {repo: n}}, {repo: n_вне_сессий}).
    """
    windows = sorted(
        ((uid, s, e) for uid, s, e in sessions if s and e),
        key=lambda w: (w[2] - w[1]),
    )
    hits, outside = {}, {}
    for repo, rows in commits.items():
        for dt, _sha in rows:
            owner = next((uid for uid, s, e in windows if s <= dt <= e), None)
            if owner is None:
                outside[repo] = outside.get(repo, 0) + 1
            else:
                hits.setdefault(owner, {})[repo] = hits.setdefault(owner, {}).get(repo, 0) + 1
    return hits, outside


def load_titles():
    titles = {}
    if os.path.exists(TITLES):
        for line in open(TITLES, encoding="utf-8"):
            line = line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            key, _, val = line.partition("\t")
            if val.strip():
                titles[key.strip()[:8]] = val.strip()
    return titles


def human_span(start, end):
    """'9д 18ч' / '2ч 15м' / '12м'."""
    total = int((end - start).total_seconds())
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes = rem // 60
    if days:
        return f"{days}д {hours}ч"
    if hours:
        return f"{hours}ч {minutes:02d}м"
    return f"{minutes}м"


def cell(text, limit=64):
    """Одна строка, безопасная для ячейки markdown-таблицы."""
    text = " ".join((text or "").split())
    text = text.replace("|", "¦").replace("[", "(").replace("]", ")")
    return (text[: limit - 1] + "…") if len(text) > limit else (text or "—")


def main():
    dry = "--dry-run" in sys.argv
    cache = {}
    if os.path.exists(CACHE):
        try:
            cache = json.load(open(CACHE, encoding="utf-8"))
        except ValueError:
            print("! кэш битый, пересобираю с нуля", file=sys.stderr)

    found = glob(os.path.join(TRANSCRIPTS, TRANSCRIPT_GLOB, "*.jsonl"))
    print(f"транскриптов найдено: {len(found)}, в кэше уже: {len(cache)}")

    fresh_cut = datetime.now(timezone.utc) - timedelta(days=REFRESH_DAYS)
    scanned = 0
    for path in found:
        uid = os.path.basename(path)[:-6]
        prev = cache.get(uid)
        # перечитываем новые сессии и те, что ещё могли дописаться
        if prev and prev.get("end"):
            end = iso(prev["end"])
            if end and end < fresh_cut:
                prev["alive"] = True
                continue
        data = scan_transcript(path)
        scanned += 1
        if not data:
            continue
        data["alive"] = True
        data["uid"] = uid
        cache[uid] = data

    # сессии, чей транскрипт съела ретенция, остаются в индексе
    live = {os.path.basename(p)[:-6] for p in found}
    gone = 0
    for uid, row in cache.items():
        row.setdefault("uid", uid)
        if uid not in live:
            row["alive"] = False
            gone += 1
    print(f"перечитано транскриптов: {scanned}; в индексе без транскрипта: {gone}")

    print("собираю наши коммиты по форкам…")
    commits = our_commits()
    print(f"репозиториев с нашими коммитами: {len(commits)}")

    sessions = [(uid, iso(r.get("start")), iso(r.get("end"))) for uid, r in cache.items()]
    hits, outside = attribute(commits, sessions)
    for uid, row in cache.items():
        row["commits"] = hits.get(uid, {})

    titles = load_titles()
    rows = sorted(
        (r for r in cache.values() if r.get("start")),
        key=lambda r: r["start"],
        reverse=True,
    )

    lines = [
        "# SESSIONS — автоиндекс сессий Claude Code",
        "",
        "> **Генерируется, руками не править.** Пересборка: `python3 agent/tools/sessions-index.py`",
        "> (ритуал конца сессии — `/session-close`).",
        ">",
        "> Здесь только **где и когда**. «Почему» — в [DECISIONS.md](DECISIONS.md): он остаётся",
        "> единственным местом для решений, этот файл лишь указывает.",
        ">",
        "> **Коммиты — только наши** (то, чего нет у upstream): обычный `fetch` тащит сотни",
        "> коммитов автора, они здесь не считаются. Сопоставление — **по времени**, коммит",
        "> отдан самой узкой сессии, накрывающей его. Это карта, не аудит-трейл: коммиты",
        "> крона на сервере и сделанные руками вне сессии попадают в строку «вне сессий».",
        ">",
        "> Тема — первое сообщение владельца; перекрыть можно строкой",
        "> `<8 символов uuid><TAB><тема>` в [tools/sessions-titles.tsv](tools/sessions-titles.tsv).",
        "> `тр.` — жив ли ещё транскрипт (`~/.claude/projects/`, ретенция ~30 дней).",
        "",
        "| начало UTC | длит. | реплик | тема | наши коммиты по форкам | сессия | тр. |",
        "|---|---|---:|---|---|---|:-:|",
    ]

    for row in rows:
        start, end = iso(row["start"]), iso(row["end"])
        commits_cell = ", ".join(
            f"{repo} +{n}" for repo, n in sorted(
                (row.get("commits") or {}).items(), key=lambda kv: -kv[1]
            )
        ) or "—"
        title = titles.get(row["uid"][:8]) or row.get("title") or "—"
        lines.append(
            f"| {start:%m-%d %H:%M} | {human_span(start, end)} | {row.get('turns', 0)} "
            f"| {cell(title)} | {cell(commits_cell, 70)} | `{row['uid'][:8]}` "
            f"| {'✓' if row.get('alive') else '—'} |"
        )

    attributed = sum(sum((r.get("commits") or {}).values()) for r in rows)
    out_total = sum(outside.values())
    out_cell = ", ".join(f"{k} {v}" for k, v in sorted(outside.items(), key=lambda kv: -kv[1]))
    lines += [
        "",
        f"Сессий в индексе: **{len(rows)}** "
        f"(с живым транскриптом: {sum(1 for r in rows if r.get('alive'))}). "
        f"Наших коммитов привязано к сессиям: **{attributed}**.",
        "",
        f"Вне окон сессий: **{out_total}** — {out_cell or '—'}. "
        "Это крон на сервере, коммиты руками и работа до появления индекса.",
        "",
    ]

    text = "\n".join(lines)
    if dry:
        print(text)
        return

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    with open(CACHE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"записано: {OUT} ({len(rows)} сессий), кэш: {CACHE}")


if __name__ == "__main__":
    main()
