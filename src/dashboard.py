import streamlit as st
import pandas as pd
import plotly.express as px
import os
from datetime import datetime

# Determine the absolute path to the project root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(BASE_DIR, "data", "monitoring_report.csv")

st.set_page_config(page_title="Hackathon Monitor", layout="wide")

def load_data():
    if not os.path.exists(DATA_FILE):
        return None
    df = pd.read_csv(DATA_FILE)
    # Convert date columns to datetime objects
    df['Created At'] = pd.to_datetime(df['Created At'])
    df['Latest Commit Date'] = pd.to_datetime(df['Latest Commit Date'])
    return df

def main():
    st.title("🚀 Hackathon Repository Monitor")
    
    df = load_data()
    
    if df is None:
        st.error(f"Data file not found at {DATA_FILE}. Please run the monitor script first.")
        st.code("python src/monitor.py")
        return

    # Sidebar for navigation
    st.sidebar.header("Navigation")
    view_mode = st.sidebar.radio("View Mode", ["Dashboard Overview", "Team Details"])

    if view_mode == "Dashboard Overview":
        show_overview(df)
    else:
        show_team_details(df)

def show_overview(df):
    st.header("📊 Dashboard Overview")
    
    # Top level metrics
    col1, col2, col3 = st.columns(3)
    total_teams = len(df)
    forks = df[df['Is Fork'] == True].shape[0]
    active_repos = df[df['Status'] == 'Success'].shape[0]

    col1.metric("Total Teams", total_teams)
    col2.metric("Forks Detected", forks)
    col3.metric("Active Repositories", active_repos)

    st.divider()

    # Visualizations
    c1, c2 = st.columns(2)

    with c1:
        st.subheader("Repository Creation Timeline")
        fig_dates = px.scatter(df, x="Created At", y="Team Name", 
                               color="Is Fork", 
                               title="Repo Creation Dates (Check for pre-existing work)",
                               hover_data=["Repository URL"])
        st.plotly_chart(fig_dates, use_container_width=True)

    with c2:
        st.subheader("Latest Activity")
        # Sort by latest commit
        df_sorted = df.sort_values(by="Latest Commit Date", ascending=False)
        fig_activity = px.bar(df_sorted, x="Latest Commit Date", y="Team Name",
                              title="Latest Commit Timestamp",
                              orientation='h')
        st.plotly_chart(fig_activity, use_container_width=True)

    # Fork Distribution
    st.subheader("Repository Types")
    fork_counts = df['Is Fork'].value_counts().reset_index()
    fork_counts.columns = ['Is Fork', 'Count']
    # Map boolean to string for better legend
    fork_counts['Type'] = fork_counts['Is Fork'].map({True: 'Fork', False: 'Original'})
    
    fig_pie = px.pie(fork_counts, values='Count', names='Type', title="Original vs Forked Repositories")
    st.plotly_chart(fig_pie)

    st.subheader("Raw Data")
    st.dataframe(df)

def show_team_details(df):
    st.header("🔍 Team Details")
    
    team_names = df['Team Name'].tolist()
    selected_team = st.sidebar.selectbox("Select a Team", team_names)
    
    if selected_team:
        team_data = df[df['Team Name'] == selected_team].iloc[0]
        
        st.subheader(f"Details for {selected_team}")
        
        # Status Badge
        status = team_data['Status']
        if status == 'Success':
            st.success(f"Status: {status}")
        else:
            st.error(f"Status: {status}")

        # Display details in a nice grid
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("### Repository Info")
            st.markdown(f"**URL:** [{team_data['Repository URL']}]({team_data['Repository URL']})")
            st.markdown(f"**Is Fork:** {'Yes ⚠️' if team_data['Is Fork'] else 'No ✅'}")
            
        with col2:
            st.markdown("### Timestamps")
            st.markdown(f"**Created At:** {team_data['Created At']}")
            st.markdown(f"**Latest Commit:** {team_data['Latest Commit Date']}")

        st.divider()
        
        # Logic for "Freshness" check (Example logic)
        st.markdown("### Automated Checks")
        
        # Check if created before 2026 (Just as an example threshold)
        creation_date = team_data['Created At']
        if pd.notnull(creation_date):
            # Assuming hackathon started Jan 1st 2026 for this context
            hackathon_start = datetime(2026, 1, 1)
            if creation_date < hackathon_start:
                st.warning(f"⚠️ Repository was created before Jan 1, 2026 ({creation_date.date()}). This might be an existing project.")
            else:
                st.info(f"✅ Repository created during hackathon period ({creation_date.date()}).")
        
if __name__ == "__main__":
    main()
