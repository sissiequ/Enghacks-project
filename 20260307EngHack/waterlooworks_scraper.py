import argparse
import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


def resolve_path(raw: str) -> Path:
    p = Path(raw)
    if p.is_absolute():
        return p
    return (Path(__file__).resolve().parent / p).resolve()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape WaterlooWorks job results after manual login."
    )
    parser.add_argument("--url", required=True, help="WaterlooWorks jobs page URL.")
    parser.add_argument(
        "--keyword",
        default="",
        help="Only keep jobs whose combined text matches this keyword.",
    )
    parser.add_argument("--max-pages", type=int, default=100, help="Max pages to crawl.")
    parser.add_argument("--output-dir", default="output", help="Export directory.")
    parser.add_argument(
        "--selectors",
        default="waterlooworks_selectors.json",
        help="Path to selector config JSON file.",
    )
    parser.add_argument("--headless", action="store_true", help="Run browser headless.")
    parser.add_argument(
        "--profile-dir",
        default=".ww_profile",
        help="Persistent browser profile directory for login reuse.",
    )
    parser.add_argument(
        "--skip-details",
        action="store_true",
        help="Skip per-posting detail fields to speed up runs.",
    )
    parser.add_argument(
        "--cdp-url",
        default="",
        help="Connect to an existing Chrome via CDP, e.g. http://127.0.0.1:9222",
    )
    return parser.parse_args()


def load_selectors(path: Path) -> Dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f"Selectors file not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_record(record: Dict[str, str]) -> Dict[str, str]:
    return {k: clean_text(v or "") for k, v in record.items()}


def should_keep(record: Dict[str, str], keyword: str) -> bool:
    if not keyword:
        return True
    haystack = " ".join(record.values()).lower()
    return keyword.lower() in haystack


def extract_rows_from_data_viewer(page) -> List[Dict[str, str]]:
    js = r"""
    () => {
      const app = (typeof dataViewerApp !== 'undefined') ? dataViewerApp : window.dataViewerApp;
      if (!app) return [];
      const dv = app.$dataViewer || app;
      if (!dv || typeof dv.getRow !== 'function') return [];

      function toText(v, depth = 0) {
        if (v == null) return '';
        if (depth > 3) return '';
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') return String(v);
        if (Array.isArray(v)) return v.map(x => toText(x, depth + 1)).filter(Boolean).join(' | ');
        if (t === 'object') {
          if ('postingTitle' in v) return toText(v.postingTitle, depth + 1);
          if ('value' in v) return toText(v.value, depth + 1);
          return Object.values(v).slice(0, 10).map(x => toText(x, depth + 1)).filter(Boolean).join(' | ');
        }
        return '';
      }

      function cell(data, key) {
        if (!data || !(key in data)) return '';
        return toText(data[key]).trim();
      }

      const ids = [];
      const candidates = [
        dv?.$data?.displayRows,
        dv?.$data?.rowIds,
        dv?.$data?.rows?.map(r => r?.id),
      ];
      for (const arr of candidates) {
        if (Array.isArray(arr) && arr.length) {
          for (const x of arr) {
            const n = Number(x);
            if (Number.isFinite(n)) ids.push(n);
          }
          if (ids.length) break;
        }
      }

      const uniqIds = [...new Set(ids)];
      const rows = uniqIds
        .map(id => dv.getRow(id))
        .filter(Boolean)
        .map(r => ({ id: r.id, data: r.data || {} }));

      return rows.map(r => {
        const d = r.data;
        const title = cell(d, 'JobTitle') || cell(d, 'Position') || cell(d, 'Title');
        const org = cell(d, 'Organization') || cell(d, 'Employer');
        const div = cell(d, 'Division');
        const location = cell(d, 'City') || cell(d, 'Location');
        const level = cell(d, 'Level');
        const deadline = cell(d, 'Deadline') || cell(d, 'AppDeadline');
        const postingId = cell(d, 'ID') || String(r.id || '');

        return {
          posting_id: String(r.id || postingId || ''),
          title: title,
          company: [org, div].filter(Boolean).join(' - '),
          location: location,
          term: level,
          posted_date: '',
          deadline: deadline,
          job_id: postingId || String(r.id || ''),
          detail_link: '',
          special_requirements: cell(d, 'cf12') || cell(d, 'SpecialRequirements'),
          job_responsibilities: cell(d, 'cf2') || cell(d, 'JobResponsibilities'),
          required_skills: cell(d, 'Qualifications') || cell(d, 'RequiredSkills'),
          raw_text: toText(d),
        };
      });
    }
    """
    try:
        out = page.evaluate(js)
        if isinstance(out, list):
            return [normalize_record(x) for x in out if isinstance(x, dict)]
        return []
    except Exception:
        return []


def get_visible_posting_ids(page) -> List[str]:
    js = r"""
    () => {
      const app = (typeof dataViewerApp !== 'undefined') ? dataViewerApp : window.dataViewerApp;
      if (!app) return [];
      const dv = app.$dataViewer || app;
      const ids = [];
      const cands = [dv?.$data?.displayRows, dv?.$data?.rowIds, dv?.$data?.rows?.map(r => r?.id)];
      for (const arr of cands) {
        if (Array.isArray(arr) && arr.length) {
          for (const x of arr) {
            const n = Number(x);
            if (Number.isFinite(n)) ids.push(String(n));
          }
          if (ids.length) break;
        }
      }
      return [...new Set(ids)];
    }
    """
    try:
        out = page.evaluate(js)
        if isinstance(out, list):
            return [clean_text(x) for x in out if clean_text(x)]
        return []
    except Exception:
        return []


def extract_rows_from_table(page, posting_ids: List[str]) -> List[Dict[str, str]]:
    table = page.query_selector("#dataViewerPlaceholder table.data-viewer-table")
    if table is None:
        table = page.query_selector("table.data-viewer-table")
    if table is None:
        return []

    rows = table.query_selector_all("tbody tr")
    if not rows:
        return []

    headers = [clean_text(h.inner_text()).lower() for h in table.query_selector_all("thead th")]

    def idx_of(*names: str) -> int:
        for i, h in enumerate(headers):
            if any(n in h for n in names):
                return i
        return -1

    i_title = idx_of("job title", "position", "title")
    i_org = idx_of("organization", "employer")
    i_div = idx_of("division")
    i_city = idx_of("city", "location")
    i_level = idx_of("level")
    i_deadline = idx_of("app deadline", "deadline")
    i_id = idx_of("id")

    records: List[Dict[str, str]] = []
    for ridx, row in enumerate(rows):
        id_from_checkbox = ""
        checkbox = row.query_selector("input[name='dataViewerSelection']")
        if checkbox is not None:
            id_from_checkbox = clean_text(checkbox.get_attribute("value") or "")

        id_from_th = ""
        th_id = row.query_selector("th[scope='row'] .overflow--ellipsis")
        if th_id is not None:
            id_from_th = clean_text(th_id.inner_text())
        elif row.query_selector("th[scope='row']") is not None:
            id_from_th = clean_text(row.query_selector("th[scope='row']").inner_text())

        id_cell = id_from_checkbox or id_from_th
        td_cells = [clean_text(td.inner_text()) for td in row.query_selector_all("td")]
        cells = [id_cell] + td_cells
        if len(cells) < 3:
            continue

        def v(i: int) -> str:
            return cells[i] if 0 <= i < len(cells) else ""

        posting_id = posting_ids[ridx] if ridx < len(posting_ids) else id_cell
        job_id = v(i_id) or posting_id or id_cell
        title = v(i_title if i_title >= 0 else 0)
        org = v(i_org if i_org >= 0 else 1)
        div = v(i_div if i_div >= 0 else 2)

        record = {
            "posting_id": posting_id,
            "title": title,
            "company": " - ".join([x for x in [org, div] if x]),
            "location": v(i_city),
            "term": v(i_level),
            "posted_date": "",
            "deadline": v(i_deadline),
            "job_id": job_id,
            "detail_link": "",
            "special_requirements": "",
            "job_responsibilities": "",
            "required_skills": "",
            "raw_text": " | ".join(cells),
        }
        records.append(normalize_record(record))

    return records


def extract_from_dom(page, selectors: Dict[str, str]) -> List[Dict[str, str]]:
    card_selector = selectors.get("job_card", "")
    if not card_selector:
        return []

    cards = page.query_selector_all(card_selector)
    records: List[Dict[str, str]] = []
    for card in cards:
        try:
            raw = clean_text(card.inner_text())
        except Exception:
            continue
        records.append(
            normalize_record(
                {
                    "posting_id": "",
                    "title": raw[:120],
                    "company": "",
                    "location": "",
                    "term": "",
                    "posted_date": "",
                    "deadline": "",
                    "job_id": "",
                    "detail_link": "",
                    "special_requirements": "",
                    "job_responsibilities": "",
                    "required_skills": "",
                    "raw_text": raw,
                }
            )
        )
    return records


def fetch_details_for_postings(page, posting_ids: List[str]) -> Dict[str, Dict[str, str]]:
    if not posting_ids:
        return {}

    js = r"""
    async (ids) => {
      function normalize(s) {
        return (s || '').toString().replace(/\s+/g, ' ').trim();
      }
      function txt(v) {
        if (v == null) return '';
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return normalize(String(v));
        if (Array.isArray(v)) return normalize(v.map(txt).filter(Boolean).join(' | '));
        if (typeof v === 'object') {
          if ('value' in v) return txt(v.value);
          if ('postingTitle' in v) return txt(v.postingTitle);
          return normalize(Object.values(v).map(txt).filter(Boolean).join(' | '));
        }
        return '';
      }

      function sectionFromHtml(html, labels) {
        if (!html) return '';
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const elems = Array.from(wrap.querySelectorAll('h1,h2,h3,h4,h5,strong,b,p,td,th,label,div,span,li'));
        const normalizedLabels = labels.map(x => x.toLowerCase());

        for (const el of elems) {
          const t = normalize(el.textContent || '').toLowerCase().replace(/:$/, '');
          if (!t) continue;
          const hit = normalizedLabels.some(lb => t === lb || t.startsWith(lb + ' '));
          if (!hit) continue;

          const chunk = [];
          let cur = el.nextElementSibling;
          let steps = 0;
          while (cur && steps < 10) {
            const ct = normalize(cur.textContent || '');
            if (!ct) {
              cur = cur.nextElementSibling;
              steps += 1;
              continue;
            }
            if (normalizedLabels.some(lb => ct.toLowerCase().startsWith(lb))) break;
            chunk.push(ct);
            cur = cur.nextElementSibling;
            steps += 1;
          }
          if (chunk.length) return normalize(chunk.join(' '));
        }
        return '';
      }

      function callPostingData(id) {
        return new Promise(resolve => {
          if (typeof getPostingData !== 'function') return resolve(null);
          try { getPostingData(id, data => resolve(data || null)); }
          catch (_) { resolve(null); }
        });
      }

      function callPostingOverview(id) {
        return new Promise(resolve => {
          if (typeof getPostingOverview !== 'function') return resolve('');
          try { getPostingOverview(id, html => resolve(html || '')); }
          catch (_) { resolve(''); }
        });
      }

      const out = {};
      for (const rawId of ids) {
        const id = Number(rawId);
        if (!Number.isFinite(id)) continue;

        const data = await callPostingData(id);
        const overview = await callPostingOverview(id);

        const special = txt(data?.cf12) || txt(data?.SpecialRequirements)
          || sectionFromHtml(overview, ['Special Job Requirements', 'Special Requirements']);
        const responsibilities = txt(data?.cf2) || txt(data?.JobResponsibilities)
          || sectionFromHtml(overview, ['Job Responsibilities', 'Job Responsibility']);
        const skills = txt(data?.Qualifications) || txt(data?.RequiredSkills)
          || sectionFromHtml(overview, ['Required Skills', 'Qualifications']);

        out[String(id)] = {
          special_requirements: normalize(special),
          job_responsibilities: normalize(responsibilities),
          required_skills: normalize(skills),
        };
      }
      return out;
    }
    """

    try:
        out = page.evaluate(js, posting_ids)
        if isinstance(out, dict):
            cleaned: Dict[str, Dict[str, str]] = {}
            for k, v in out.items():
                if not isinstance(v, dict):
                    continue
                cleaned[str(k)] = {
                    "special_requirements": clean_text(v.get("special_requirements", "")),
                    "job_responsibilities": clean_text(v.get("job_responsibilities", "")),
                    "required_skills": clean_text(v.get("required_skills", "")),
                }
            return cleaned
        return {}
    except Exception:
        return {}


def click_next(page, selectors: Dict[str, str]) -> bool:
    selectors_js = [
        s
        for s in [
            selectors.get("next_button", ""),
            "a[aria-label*='Go to next page']",
            "button[aria-label*='Go to next page']",
            "a[aria-label*='Next']",
            "button[aria-label*='Next']",
            ".pagination__link[aria-label*='next']",
        ]
        if s
    ]
    try:
        clicked = page.evaluate(
            """(sels) => {
                const isVisible = (el) => {
                    if (!el) return false;
                    const st = window.getComputedStyle(el);
                    if (!st) return false;
                    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
                    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                };
                const isDisabled = (el) => {
                    if (!el) return true;
                    const cls = (el.className || '').toString().toLowerCase();
                    return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled') || cls.includes('disabled');
                };
                for (const sel of sels) {
                    const nodes = Array.from(document.querySelectorAll(sel));
                    const target = nodes.find(n => isVisible(n) && !isDisabled(n));
                    if (target) {
                        target.scrollIntoView({block: 'center'});
                        target.click();
                        return true;
                    }
                }
                return false;
            }""",
            selectors_js,
        )
        if clicked:
            page.wait_for_timeout(1500)
            return True
    except Exception:
        pass
    return False


def export_results(rows: List[Dict[str, str]], output_dir: Path) -> Dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = output_dir / f"waterlooworks_jobs_{stamp}.json"
    csv_path = output_dir / f"waterlooworks_jobs_{stamp}.csv"

    with json_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    fieldnames = [
        "posting_id",
        "job_id",
        "title",
        "company",
        "location",
        "term",
        "posted_date",
        "deadline",
        "special_requirements",
        "job_responsibilities",
        "required_skills",
        "detail_link",
        "raw_text",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return {"json": json_path, "csv": csv_path}


def scrape_jobs(args: argparse.Namespace) -> int:
    selectors = load_selectors(resolve_path(args.selectors))
    output_dir = resolve_path(args.output_dir)
    profile_dir = resolve_path(args.profile_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)

    results: List[Dict[str, str]] = []
    seen_keys = set()

    with sync_playwright() as p:
        context = None
        browser = None
        should_close_context = False
        should_close_browser = False

        if args.cdp_url:
            browser = p.chromium.connect_over_cdp(args.cdp_url)
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = context.pages[0] if context.pages else context.new_page()
            print(f"[INFO] Connected to existing Chrome via CDP: {args.cdp_url}")
            print("[INFO] In CDP mode, script will not close your browser window.")
        else:
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(profile_dir),
                headless=args.headless,
            )
            should_close_context = True
            page = context.pages[0] if context.pages else context.new_page()

        print(f"[INFO] Using profile dir: {profile_dir}")
        print(f"[INFO] Opening: {args.url}")
        page.goto(args.url, wait_until="domcontentloaded")
        print("[INFO] If this is your first run, login now.")
        print("[INFO] Later runs should reuse saved session from profile-dir.")
        input("[ACTION] Press Enter when result list is visible...")

        try:
            page.wait_for_function(
                "() => (typeof dataViewerApp !== 'undefined') || !!window.dataViewerApp",
                timeout=15000,
            )
            print("[INFO] DataViewer app detected.")
        except PlaywrightTimeoutError:
            print("[WARN] DataViewer app not detected yet; will still try extraction.")

        for page_index in range(1, args.max_pages + 1):
            try:
                ready_selector = selectors.get("results_ready", "body")
                page.wait_for_selector(ready_selector, timeout=15000)
            except PlaywrightTimeoutError:
                print(f"[WARN] Page {page_index}: results not ready. Stopping.")
                break

            page_records = extract_rows_from_data_viewer(page)
            source = "data-viewer"

            if not page_records:
                ids = get_visible_posting_ids(page)
                page_records = extract_rows_from_table(page, ids)
                source = "table"

            if not page_records:
                page_records = extract_from_dom(page, selectors)
                source = "dom"

            print(f"[INFO] Page {page_index}: extracted {len(page_records)} rows from {source}.")
            if not page_records:
                break

            page_ids = [r.get("posting_id", "") for r in page_records if r.get("posting_id", "")]
            if page_ids and not args.skip_details:
                print(f"[INFO] Page {page_index}: fetching details for {len(page_ids)} postings...")
                details_map = fetch_details_for_postings(page, page_ids)
            else:
                details_map = {}

            for record in page_records:
                pid = record.get("posting_id", "")
                if pid in details_map:
                    record.update(details_map[pid])
                    record = normalize_record(record)

                if not should_keep(record, args.keyword):
                    continue

                dedupe_key = (
                    record.get("posting_id") or record.get("job_id") or "",
                    record.get("title") or "",
                    record.get("company") or "",
                )
                if dedupe_key in seen_keys:
                    continue
                seen_keys.add(dedupe_key)
                results.append(record)

            if not click_next(page, selectors):
                print(f"[INFO] Page {page_index}: no usable next button. Done.")
                break

        if not results:
            print("[WARN] No jobs saved. Check selectors and try again.")
            snapshot = output_dir / "debug_last_page.html"
            output_dir.mkdir(parents=True, exist_ok=True)
            snapshot.write_text(page.content(), encoding="utf-8")
            print(f"[DEBUG] Saved page snapshot: {snapshot}")
            if should_close_context:
                context.close()
            if should_close_browser and browser is not None:
                browser.close()
            return 1

        exported = export_results(results, output_dir)
        print(f"[DONE] Saved {len(results)} jobs.")
        print(f"[DONE] JSON: {exported['json']}")
        print(f"[DONE] CSV:  {exported['csv']}")
        if should_close_context:
            context.close()
        if should_close_browser and browser is not None:
            browser.close()
        return 0


def main() -> int:
    try:
        args = parse_args()
        return scrape_jobs(args)
    except KeyboardInterrupt:
        print("\n[INFO] Cancelled by user.")
        return 130
    except Exception as e:
        print(f"[ERROR] {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
