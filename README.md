# Hackathon Repository Monitoring System

A lightweight, non-intrusive system to monitor GitHub repository activity for hackathons.

## Overview

This tool passively observes public GitHub repositories to record three objective indicators of development authenticity:
1.  **Repository Creation Time**: To verify if the project was started during the hackathon.
2.  **Commit Activity**: To track the latest development activity.
3.  **Fork Status**: To check if the repository is an original work or a fork.

## Prerequisites

- Python 3.8+
- A GitHub Personal Access Token (classic) with `repo` (for private repos) or public access.

## Setup

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Configure Environment**:
    - Copy `.env.example` to `.env`.
    - Add your GitHub Token to `.env`:
      ```
      GITHUB_TOKEN=your_token_here
      ```

3.  **Configure Repositories**:
    - Edit `config/repos.json` to include the list of teams and their repository URLs.
    ```json
    [
        {
            "team_name": "Team Name",
            "repo_url": "https://github.com/owner/repo"
        }
    ]
    ```

## Usage

1.  **Run the Monitor** (to fetch data):
    ```bash
    python src/monitor.py
    ```
    This will generate `data/monitoring_report.json` which is required for the dashboard.

2.  **Run the Dashboard UI**:
    
    Navigate to the UI directory:
    ```bash
    cd dashboard-ui
    ```

    Install dependencies (first time only):
    ```bash
    npm install
    ```

    Start the development server:
    ```bash
    npm run dev
    ```

## Output

-   **Data**: `data/monitoring_report.csv` and `data/monitoring_report.json`
-   **Dashboard**: Opens in your web browser at `http://localhost:5173`

## License

MIT
