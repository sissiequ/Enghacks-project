# 20260307EngHack

WaterlooWorks job scraper (manual login + automatic collection).

## What this does
- Open WaterlooWorks job search page in browser
- Let you login and set filters manually
- Crawl all result pages
- Save jobs to local `json` + `csv`
- Reuse login session with a persistent browser profile
- Save detail fields: `Special Requirements`, `Job Responsibilities`, `Required Skills`

## Setup
```bash
pip install -r requirements.txt
playwright install chromium
```

## Run
First run (login once):
```bash
python waterlooworks_scraper.py --url "https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm" --profile-dir ".ww_profile"
```

Later runs usually reuse login in `.ww_profile` and do not need re-login.

Optional args:
```bash
python waterlooworks_scraper.py ^
  --url "https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm" ^
  --keyword "software" ^
  --max-pages 20 ^
  --profile-dir ".ww_profile" ^
  --headless
```

Skip detail-field requests (faster):
```bash
python waterlooworks_scraper.py --url "https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm" --skip-details
```

Use your existing Chrome session (autofill/login):
1. Start Chrome with remote debugging:
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```
2. Run scraper in CDP mode:
```bash
python waterlooworks_scraper.py --url "https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm" --cdp-url "http://127.0.0.1:9222"
```

## Output
- `output/waterlooworks_jobs_YYYYMMDD_HHMMSS.json`
- `output/waterlooworks_jobs_YYYYMMDD_HHMMSS.csv`

## Notes
- First run usually needs updating selectors in `waterlooworks_selectors.json` (site UI may change).
- If session expires, just login once again with the same `--profile-dir`.
- Respect WaterlooWorks terms of use and rate limits.
