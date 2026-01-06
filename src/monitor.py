import os
import json
import requests
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

# Determine the absolute path to the project root (one level up from src)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load environment variables from .env file in the project root
load_dotenv(os.path.join(BASE_DIR, ".env"))

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
CONFIG_FILE = os.path.join(BASE_DIR, "config", "repos.json")
OUTPUT_FILE_CSV = os.path.join(BASE_DIR, "data", "monitoring_report.csv")
OUTPUT_FILE_JSON = os.path.join(BASE_DIR, "data", "monitoring_report.json")

HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

def get_repo_details(owner, repo_name):
    url = f"https://api.github.com/repos/{owner}/{repo_name}"
    response = requests.get(url, headers=HEADERS)
    if response.status_code == 200:
        return response.json()
    return None

def get_latest_commit(owner, repo_name):
    url = f"https://api.github.com/repos/{owner}/{repo_name}/commits"
    params = {"per_page": 1}
    response = requests.get(url, headers=HEADERS, params=params)
    if response.status_code == 200:
        commits = response.json()
        if commits:
            return commits[0]
    return None

def parse_repo_url(url):
    # Assumes format https://github.com/owner/repo
    parts = url.rstrip("/").split("/")
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    return None, None

def main():
    if not GITHUB_TOKEN:
        print("Error: GITHUB_TOKEN not found in environment variables.")
        return

    if not os.path.exists(CONFIG_FILE):
        print(f"Error: Config file not found at {CONFIG_FILE}")
        return

    with open(CONFIG_FILE, 'r') as f:
        teams = json.load(f)

    results = []

    print(f"Starting monitoring for {len(teams)} teams...")

    for team in teams:
        team_name = team.get("team_name")
        repo_url = team.get("repo_url")
        
        print(f"Processing {team_name} ({repo_url})...")

        owner, repo_name = parse_repo_url(repo_url)
        if not owner or not repo_name:
            print(f"  Invalid URL format: {repo_url}")
            continue

        repo_data = get_repo_details(owner, repo_name)
        if not repo_data:
            print(f"  Could not fetch repository data for {owner}/{repo_name}")
            results.append({
                "Team Name": team_name,
                "Repository URL": repo_url,
                "Status": "Error fetching repo",
                "Created At": None,
                "Is Fork": None,
                "Latest Commit Date": None
            })
            continue

        latest_commit = get_latest_commit(owner, repo_name)
        latest_commit_date = None
        if latest_commit:
            latest_commit_date = latest_commit['commit']['author']['date']

        results.append({
            "Team Name": team_name,
            "Repository URL": repo_url,
            "Status": "Success",
            "Created At": repo_data.get("created_at"),
            "Is Fork": repo_data.get("fork"),
            "Latest Commit Date": latest_commit_date
        })

    # Save results
    df = pd.DataFrame(results)
    
    # Ensure data directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE_CSV), exist_ok=True)
    
    df.to_csv(OUTPUT_FILE_CSV, index=False)
    df.to_json(OUTPUT_FILE_JSON, orient='records', date_format='iso')
    print(f"Monitoring complete. Results saved to {OUTPUT_FILE_CSV} and {OUTPUT_FILE_JSON}")

if __name__ == "__main__":
    main()
