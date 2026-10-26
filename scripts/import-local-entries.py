"""Import local entries.json data into NUC Wiki via API."""
import json
import urllib.request
import urllib.error
import sys
import os

WIKI_URL = os.environ.get('MICROERA_HOST', 'http://localhost:3001')
ENTRIES_FILE = os.environ.get('ENTRIES_FILE', '')

def api_call(method, path, data=None, token=None):
    url = f"{WIKI_URL}{path}"
    body = json.dumps(data).encode('utf-8') if data else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode('utf-8')[:200]}")
        return None

def login():
    admin_password = os.environ.get('ADMIN_PASSWORD', '')
    if not admin_password:
        raise SystemExit('ADMIN_PASSWORD env var is required')
    result = api_call('POST', '/api/auth/login', {'username': 'admin', 'password': admin_password})
    if result and result.get('token'):
        return result['token']
    print(f"Login failed: {result}")
    return None

def get_existing_entries(token):
    """Get all existing entries to check for duplicates."""
    result = api_call('GET', '/api/entries', token=token)
    if isinstance(result, list):
        return result
    return []

def main():
    if not ENTRIES_FILE:
        raise SystemExit('ENTRIES_FILE env var is required')
    with open(ENTRIES_FILE, encoding='utf-8') as f:
        local_entries = json.load(f)

    print(f"Local entries: {len(local_entries)}")

    token = login()
    if not token:
        print("Cannot login, aborting")
        return

    existing = get_existing_entries(token)
    print(f"Existing entries on NUC: {len(existing)}")

    existing_titles = {e['title'] for e in existing}

    imported = 0
    skipped = 0
    failed = 0

    for entry in local_entries:
        if entry['title'] in existing_titles:
            skipped += 1
            continue

        body = {
            'title': entry['title'],
            'entry_type': entry['entry_type'],
            'summary': entry.get('summary', ''),
            'content': entry.get('content', ''),
            'visibility': entry.get('visibility', 'internal'),
            'tags': entry.get('tags', []),
        }

        result = api_call('POST', '/api/entries', body, token)
        if result and result.get('id'):
            imported += 1
            print(f"  OK #{result['id']}: {entry['title']}")
        else:
            failed += 1
            print(f"  FAIL: {entry['title']}")
            if result:
                print(f"    Response: {result}")

    print(f"\nDone: {imported} imported, {skipped} skipped, {failed} failed")

if __name__ == '__main__':
    main()
