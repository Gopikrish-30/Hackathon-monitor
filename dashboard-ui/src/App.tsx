import { useState, useMemo, useEffect } from 'react';
import { LayoutDashboard, Users, GitFork, Activity, AlertCircle, CheckCircle2, ExternalLink, Filter, Clock3, Download, List, X, Loader2, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, parseISO } from 'date-fns';
import { TeamData } from './types';

// @ts-ignore
import reportDataRaw from '@data/monitoring_report.json';
// @ts-ignore
import reportJsonUrl from '@data/monitoring_report.json?url';
// @ts-ignore
import reportCsvUrl from '@data/monitoring_report.csv?url';

const reportData = Array.isArray(reportDataRaw) ? (reportDataRaw as TeamData[]) : [];
const API_BASE = (import.meta as any)?.env?.VITE_API_URL ? ((import.meta as any).env.VITE_API_URL as string).replace(/\/$/, '') : null;
const GITHUB_TOKEN = (import.meta as any)?.env?.VITE_GITHUB_TOKEN || null;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
const DEFAULT_HACKATHON_START = new Date(2026, 0, 1);

type CommitItem = {
  sha: string;
  message: string;
  date: string;
  url: string;
  author: string;
};

function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'details'>('overview');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(reportData.length > 0 ? reportData[0]["Team Name"] : null);
  const [data, setData] = useState<TeamData[]>(reportData);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [forkFilter, setForkFilter] = useState<'all' | 'fork' | 'original'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent');
  const [sixHourFilter, setSixHourFilter] = useState<'all' | 'onpace' | 'late' | 'none'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [preexistingFilter, setPreexistingFilter] = useState<'all' | 'pre' | 'fresh'>('all');
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitList, setCommitList] = useState<CommitItem[]>([]);
  const [commitTeam, setCommitTeam] = useState<string>('');
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', repo: '', status: 'Success', isFork: false, latestCommit: '' });
  const [addError, setAddError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<'upload' | 'class'>('upload');
  const [stagedTeams, setStagedTeams] = useState<TeamData[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const classOptions = ['C-203', 'E-103-A', 'E-103', 'E-101-A', 'E-101'];
  const [hackathonStart, setHackathonStart] = useState<Date>(DEFAULT_HACKATHON_START);
  const [hackathonStartInput, setHackathonStartInput] = useState<string>(() => DEFAULT_HACKATHON_START.toISOString().slice(0, 16));

  if (onboardingComplete && dataLoading && data.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Loading live data…</h2>
          <p className="text-slate-600">Fetching the latest team stats.</p>
        </div>
      </div>
    );
  }

  if (onboardingComplete && !dataLoading && data.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">No Data Found</h2>
          <p className="text-slate-600 mb-4">Please run the monitoring script first to generate the report.</p>
          <code className="bg-slate-100 px-4 py-2 rounded">python src/monitor.py</code>
        </div>
      </div>
    );
  }

  const totalTeams = data.length;
  const forks = data.filter(d => d["Is Fork"]).length;
  const activeRepos = data.filter(d => d["Status"] === "Success").length;
  const now = new Date();

  const recencyBuckets = { 'Last 24h': 0, '1-3 days': 0, '4-7 days': 0, 'Stale (>7d)': 0, 'No commits yet': 0 };
  data.forEach(team => {
    if (!team["Latest Commit Date"]) {
      recencyBuckets['No commits yet'] += 1;
      return;
    }
    const diffDays = (now.getTime() - parseISO(team["Latest Commit Date"]).getTime()) / 86400000;
    if (diffDays <= 1) recencyBuckets['Last 24h'] += 1;
    else if (diffDays <= 3) recencyBuckets['1-3 days'] += 1;
    else if (diffDays <= 7) recencyBuckets['4-7 days'] += 1;
    else recencyBuckets['Stale (>7d)'] += 1;
  });

  const staleTeams = recencyBuckets['Stale (>7d)'] + recencyBuckets['No commits yet'];
  const recencyData = Object.entries(recencyBuckets).map(([name, value]) => ({ name, value }));

  const sixHourBuckets = { 'On pace (≤4h)': 0, 'Late (>4h)': 0, 'No commits yet': 0 };
  data.forEach(team => {
    if (!team["Latest Commit Date"]) {
      sixHourBuckets['No commits yet'] += 1;
      return;
    }
    const diffHours = (now.getTime() - parseISO(team["Latest Commit Date"]).getTime()) / (1000 * 60 * 60);
    if (diffHours <= 4) sixHourBuckets['On pace (≤4h)'] += 1;
    else sixHourBuckets['Late (>4h)'] += 1;
  });
  const sixHourData = Object.entries(sixHourBuckets).map(([name, value]) => ({ name, value }));

  const forkData = [
    { name: 'Original', value: totalTeams - forks },
    { name: 'Fork', value: forks },
  ];

  const activityData = [...data]
    .filter(d => d["Latest Commit Date"])
    .map(d => {
      const parsed = parseISO(d["Latest Commit Date"]!);
      return {
        name: d["Team Name"],
        repo: d["Repository URL"],
        timestamp: parsed.getTime(),
        label: format(parsed, 'MMM dd, HH:mm'),
        recency: formatRecency(d["Latest Commit Date"]),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  const filteredTeams = useMemo(() => {
    const results = data
      .filter(team => {
        const matchesSearch = team["Team Name"].toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' ? true : (team["Status"] || 'Unknown') === statusFilter;
        const matchesFork =
          forkFilter === 'all'
            ? true
            : forkFilter === 'fork'
              ? !!team["Is Fork"]
              : !team["Is Fork"];
        const hoursSinceCommit = team["Latest Commit Date"] ? (now.getTime() - parseISO(team["Latest Commit Date"]).getTime()) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
        const matchesClass = classFilter === 'all' ? true : (team["Class"] || 'Unassigned') === classFilter;
        const createdDate = team["Created At"] ? parseISO(team["Created At"]) : null;
        const matchesPreexisting = (() => {
          if (preexistingFilter === 'all') return true;
          if (!createdDate) return false;
          const isPre = createdDate < hackathonStart;
          return preexistingFilter === 'pre' ? isPre : !isPre;
        })();
        const matchesSixHour = (() => {
          switch (sixHourFilter) {
            case 'onpace':
              return hoursSinceCommit <= 4;
            case 'late':
              return hoursSinceCommit > 4 && hoursSinceCommit < Number.POSITIVE_INFINITY;
            case 'none':
              return !team["Latest Commit Date"];
            default:
              return true;
          }
        })();

        return matchesSearch && matchesStatus && matchesFork && matchesSixHour && matchesClass && matchesPreexisting;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a["Team Name"].localeCompare(b["Team Name"]);
        const aTime = a["Latest Commit Date"] ? parseISO(a["Latest Commit Date"]).getTime() : 0;
        const bTime = b["Latest Commit Date"] ? parseISO(b["Latest Commit Date"]).getTime() : 0;
        return bTime - aTime;
      });
    return results;
  }, [data, searchQuery, statusFilter, forkFilter, sortBy, sixHourFilter, classFilter, preexistingFilter, hackathonStart, now]);

  useEffect(() => {
    if (!filteredTeams.length) {
      setSelectedTeam(null);
      return;
    }
    const stillVisible = filteredTeams.find(team => team["Team Name"] === selectedTeam);
    if (!stillVisible) {
      setSelectedTeam(filteredTeams[0]["Team Name"]);
    }
  }, [filteredTeams, selectedTeam]);

  const uniqueStatuses = useMemo(() => Array.from(new Set(data.map(d => d["Status"] || 'Unknown'))), [data]);
  const statusOptions = useMemo(() => [...new Set(['Success', 'Pending', 'Unknown', ...uniqueStatuses])], [uniqueStatuses]);

  const ghHeaders: HeadersInit = {
    Accept: 'application/vnd.github+json',
    ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  };

  const fetchTeams = async () => {
    try {
      setDataLoading(true);
      setDataError(null);

      if (!API_BASE) {
        const baseSource = data.length ? data : reportData;
        const base = baseSource.map(item => ({
          "Team Name": item["Team Name"],
          "Repository URL": item["Repository URL"],
          "Status": 'Loading',
          "Created At": item["Created At"] || null,
          "Is Fork": item["Is Fork"] ?? null,
          "Latest Commit Date": item["Latest Commit Date"] || null,
          "Class": item["Class"] || null,
        }));
        setData(base);
        if (base.length) {
          setSelectedTeam(base[0]["Team Name"]);
          await fetchLiveFromGitHub(base);
        }
        return;
      }

      const res = await fetch(`${API_BASE}/teams`);
      if (!res.ok) {
        throw new Error(`API error ${res.status}`);
      }
      const body = await res.json();
      if (!Array.isArray(body)) {
        throw new Error('Unexpected API response. Expected an array of teams.');
      }
      const mapped: TeamData[] = body.map((item: any, idx: number) => ({
        "Team Name": item["Team Name"] || item.name || 'Unknown Team',
        "Repository URL": item["Repository URL"] || item.repo || item.repo_url || '',
        "Status": 'Loading',
        "Created At": null,
        "Is Fork": null,
        "Latest Commit Date": null,
        "Class": item["Class"] || item.class || classOptions[idx % classOptions.length],
      }));
      setData(mapped);
      if (mapped.length) {
        setSelectedTeam(mapped[0]["Team Name"]);
        await fetchLiveFromGitHub(mapped);
      }
    } catch (err: any) {
      setDataError(err?.message || 'Unable to load data');
      // Fallback to bundled report so the UI still works, then live fetch
      const baseSource = data.length ? data : reportData;
      const base = baseSource.map(item => ({
        "Team Name": item["Team Name"] || 'Unknown Team',
        "Repository URL": item["Repository URL"] || '',
        "Status": 'Loading',
        "Created At": item["Created At"] || null,
        "Is Fork": item["Is Fork"] ?? null,
        "Latest Commit Date": item["Latest Commit Date"] || null,
        "Class": item["Class"] || null,
      }));
      setData(base);
      if (base.length) {
        setSelectedTeam(base[0]["Team Name"]);
        await fetchLiveFromGitHub(base);
      }
    } finally {
      setDataLoading(false);
    }
  };

  const fetchLiveFromGitHub = async (baseList?: TeamData[]) => {
    const source = baseList ?? data;
    if (!source.length) return;
    setLiveLoading(true);
    setLiveError(null);
    const concurrency = 5;
    let index = 0;
    const updated: TeamData[] = new Array(source.length);

    const workers = Array.from({ length: concurrency }).map(async () => {
      while (true) {
        const current = index++;
        if (current >= source.length) break;

        const team = source[current];
        try {
          const parsed = new URL(team["Repository URL"]);
          const repoPath = parsed.pathname.replace(/^\//, '');
          if (!repoPath || !repoPath.includes('/')) {
            throw new Error('Invalid repo path');
          }

          const repoResp = await fetch(`https://api.github.com/repos/${repoPath}`, { headers: ghHeaders });
          if (!repoResp.ok) {
            throw new Error(`Repo fetch failed: ${repoResp.status}`);
          }
          const repoJson = await repoResp.json();

          const commitsResp = await fetch(`https://api.github.com/repos/${repoPath}/commits?per_page=1`, { headers: ghHeaders });
          let latestCommit: string | null = null;
          if (commitsResp.ok) {
            const commitsJson = await commitsResp.json();
            if (Array.isArray(commitsJson) && commitsJson[0]?.commit?.author?.date) {
              latestCommit = commitsJson[0].commit.author.date;
            }
          }

          updated[current] = {
            "Team Name": team["Team Name"],
            "Repository URL": team["Repository URL"],
            "Status": 'Success',
            "Created At": repoJson.created_at || null,
            "Is Fork": !!repoJson.fork,
            "Latest Commit Date": latestCommit,
            "Class": team["Class"] || null,
          };
        } catch (err: any) {
          updated[current] = {
            ...team,
            "Status": 'Failure',
            "Latest Commit Date": team["Latest Commit Date"] || null,
          };
          setLiveError(err?.message || 'Some repositories could not be refreshed.');
        }
      }
    });

    await Promise.all(workers);
    const clean = updated.filter(Boolean) as TeamData[];
    if (clean.length) {
      // If we refreshed the full list, replace; if we refreshed a subset, merge back into existing data.
      if (source.length === data.length) {
        setData(clean);
        setSelectedTeam(prev => prev ?? clean[0]["Team Name"]);
      } else {
        const map = new Map(clean.map(item => [item["Team Name"], item]));
        setData(prev => prev.map(item => map.get(item["Team Name"]) || item));
      }
    }
    setLiveLoading(false);
  };

  const handleAddTeam = () => {
    const name = addForm.name.trim();
    const repo = addForm.repo.trim();

    if (!name || !repo) {
      setAddError('Team name and repository URL are required.');
      return;
    }

    try {
      // Validate repository URL format; throws on invalid
      new URL(repo);
    } catch (err) {
      setAddError('Please enter a valid repository URL.');
      return;
    }

    if (data.some(team => team["Team Name"].toLowerCase() === name.toLowerCase())) {
      setAddError('A team with this name already exists.');
      return;
    }

    let latestCommitIso: string | null = null;
    if (addForm.latestCommit) {
      const parsed = new Date(addForm.latestCommit);
      if (!Number.isNaN(parsed.getTime())) {
        latestCommitIso = parsed.toISOString();
      }
    }
    const newTeam: TeamData = {
      "Team Name": name,
      "Repository URL": repo,
      "Status": addForm.status,
      "Created At": new Date().toISOString(),
      "Is Fork": addForm.isFork,
      "Latest Commit Date": latestCommitIso,
      "Class": classOptions[data.length % classOptions.length],
    };

    setData(prev => [...prev, newTeam]);
    setSelectedTeam(name);
    setAddForm({ name: '', repo: '', status: addForm.status, isFork: false, latestCommit: '' });
    setAddError(null);
    setAddFormOpen(false);
  };

  const fetchCommits = async (team: TeamData) => {
    setCommitModalOpen(true);
    setCommitLoading(true);
    setCommitError(null);
    setCommitList([]);
    setCommitTeam(team["Team Name"]);

    try {
      const repoUrl = team["Repository URL"];
      const parsed = new URL(repoUrl);
      const repoPath = parsed.pathname.replace(/^\//, '');
      if (!repoPath || !repoPath.includes('/')) {
        throw new Error('Could not parse repository path');
      }
      const apiUrl = `https://api.github.com/repos/${repoPath}/commits?per_page=20`;
      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status}`);
      }
      const commits = await res.json();
      const mapped: CommitItem[] = commits.map((c: any) => ({
        sha: c.sha,
        message: c.commit?.message || 'No message',
        date: c.commit?.author?.date || '',
        url: c.html_url,
        author: c.commit?.author?.name || 'Unknown',
      }));
      setCommitList(mapped);
    } catch (err: any) {
      setCommitError(err?.message || 'Unable to load commits');
    } finally {
      setCommitLoading(false);
    }
  };

  function formatRecency(date: string | null) {
    if (!date) return 'No commits yet';
    const diffHours = Math.round((now.getTime() - parseISO(date).getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  }

  const handleCsvUpload = async (file: File) => {
    setUploadError(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      const header = lines.shift();
      if (!header) throw new Error('Empty CSV');
      const cols = header.split(',').map(c => c.trim().toLowerCase());
      const nameIdx = cols.findIndex(c => c.includes('team name')); 
      const repoIdx = cols.findIndex(c => c.includes('repo'));
      const classIdx = cols.findIndex(c => c.includes('class'));
      if (nameIdx === -1 || repoIdx === -1) throw new Error('CSV needs headers including Team Name and Repository URL');
      const cleanCell = (val?: string) => {
        if (!val) return '';
        const trimmed = val.trim();
        const unquoted = trimmed.replace(/^"(.*)"$/, '$1');
        return unquoted;
      };

      const errors: string[] = [];
      const parsed: TeamData[] = [];

      lines.forEach((line, idx) => {
        const cells = line.split(',');
        const nameRaw = cleanCell(cells[nameIdx]);
        const repoRaw = cleanCell(cells[repoIdx]);
        const classRaw = classIdx !== -1 ? cleanCell(cells[classIdx]) : null;

        if (!repoRaw) {
          errors.push(`Row ${idx + 2}: missing repo URL`);
          return;
        }
        try {
          new URL(repoRaw);
        } catch {
          errors.push(`Row ${idx + 2}: invalid repo URL`);
          return;
        }

        parsed.push({
          "Team Name": nameRaw || `Team ${idx + 1}`,
          "Repository URL": repoRaw,
          "Status": 'Loading',
          "Created At": null,
          "Is Fork": null,
          "Latest Commit Date": null,
          "Class": classIdx !== -1 ? (classRaw || null) : classOptions[idx % classOptions.length],
        });
      });

      if (!parsed.length) throw new Error(errors[0] || 'No rows parsed. Check CSV content.');
      if (errors.length) {
        setUploadError(`Some rows skipped: ${errors.slice(0, 3).join(' | ')}`);
      }
      const hasClassProvided = classIdx !== -1;
      setStagedTeams(parsed);
      if (hasClassProvided) {
        await startDashboardWith(parsed);
      } else {
        setOnboardingStep('class');
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to parse CSV');
    }
  };

  const handleHackathonStartChange = (value: string) => {
    setHackathonStartInput(value);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      setUploadError('Invalid hackathon start date');
      return;
    }
    setUploadError(null);
    setHackathonStart(parsed);
  };

  const downloadAssignmentsCsv = () => {
    const rows = [
      ['Team Name', 'Repository URL', 'Class'],
      ...data.map(team => [
        team['Team Name'] || '',
        team['Repository URL'] || '',
        team['Class'] || 'Unassigned',
      ]),
    ];
    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'teams_with_class.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleManualAdd = (name: string, repo: string) => {
    if (!name || !repo) {
      setUploadError('Name and repo are required');
      return;
    }
    try { new URL(repo); } catch { setUploadError('Invalid repo URL'); return; }
    const newTeam: TeamData = {
      "Team Name": name,
      "Repository URL": repo,
      "Status": 'Loading',
      "Created At": null,
      "Is Fork": null,
      "Latest Commit Date": null,
      "Class": classOptions[stagedTeams.length % classOptions.length],
    };
    setStagedTeams(prev => [...prev, newTeam]);
    setUploadError(null);
  };

  const startDashboardWith = async (teams: TeamData[]) => {
    if (!teams.length) {
      setUploadError('Please add at least one team');
      return;
    }
    setData(teams);
    setSelectedTeam(teams[0]["Team Name"]);
    setUploadError(null);
    setOnboardingComplete(true);
    await fetchLiveFromGitHub(teams);
  };

  const startDashboard = async () => {
    await startDashboardWith(stagedTeams);
  };

  if (!onboardingComplete) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Setup</p>
              <h2 className="text-2xl font-bold text-slate-800">Upload teams and assign classes</h2>
              <p className="text-sm text-slate-600">Import CSV or add manually, then map teams to the 5 classes (20 teams each).</p>
            </div>
            <div className="flex gap-2 text-sm">
              <span className={`px-3 py-1 rounded-full border ${onboardingStep === 'upload' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>1. Upload</span>
              <span className={`px-3 py-1 rounded-full border ${onboardingStep === 'class' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>2. Class assign</span>
            </div>
          </div>

          {uploadError && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{uploadError}</div>}

          {onboardingStep === 'upload' && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-dashed border-slate-300 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-slate-800">Upload CSV</h3>
                <p className="text-sm text-slate-600">Headers needed: Team Name, Repository URL (optional: Class)</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleCsvUpload(f);
                  }}
                  className="block w-full text-sm text-slate-700"
                />
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-slate-800">Add manually</h3>
                <ManualAdder onAdd={handleManualAdd} />
              </div>
            </div>
          )}

          {onboardingStep === 'upload' && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <h3 className="font-semibold text-slate-800">Hackathon start date/time</h3>
              <p className="text-sm text-slate-600">This is used to flag pre-existing repos.</p>
              <input
                type="datetime-local"
                value={hackathonStartInput}
                onChange={(e) => handleHackathonStartChange(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          )}

          {onboardingStep === 'class' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Assign classes (5 classes, ~20 teams each)</h3>
                <button
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  onClick={() => setOnboardingStep('upload')}
                >
                  Back to upload
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
                {stagedTeams.map((team, idx) => (
                  <div key={team["Team Name"] + idx} className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{team["Team Name"]}</p>
                      <p className="text-xs text-slate-500 truncate">{team["Repository URL"]}</p>
                    </div>
                    <select
                      value={team["Class"] || classOptions[idx % classOptions.length]}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStagedTeams(prev => prev.map((t, i) => i === idx ? { ...t, "Class": val } : t));
                      }}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    >
                      {classOptions.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {onboardingStep === 'upload' && (
              <button
                className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60"
                disabled={!stagedTeams.length}
                onClick={() => setOnboardingStep('class')}
              >
                Next: assign classes
              </button>
            )}
            {onboardingStep === 'class' && (
              <button
                className="px-4 py-2 rounded-lg bg-green-600 text-white disabled:opacity-60"
                onClick={startDashboard}
              >
                Start dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 relative">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white fixed h-full">
        <div className="p-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="text-blue-400" />
            HackMonitor
          </h1>
          <p className="text-xs text-slate-400 mt-2">Live snapshot of hackathon repos</p>
        </div>
        <nav className="mt-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-6 py-3 text-left transition-colors ${
              activeTab === 'overview' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard size={20} />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`w-full flex items-center gap-3 px-6 py-3 text-left transition-colors ${
              activeTab === 'details' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Users size={20} />
            Team Details
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1 p-8">
        {activeTab === 'overview' ? (
          <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <h2 className="text-2xl font-bold text-slate-800">Dashboard Overview</h2>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  {dataError && (
                    <span className="text-red-600 bg-red-50 border border-red-100 px-3 py-1 rounded-lg">{dataError}</span>
                  )}
                  {liveError && (
                    <span className="text-orange-700 bg-orange-50 border border-orange-100 px-3 py-1 rounded-lg">{liveError}</span>
                  )}
                  <button
                    onClick={fetchTeams}
                    disabled={dataLoading}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 ${dataLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {dataLoading ? <Loader2 size={16} className="animate-spin" /> : <Clock3 size={16} />}
                    Refresh
                  </button>
                  <button
                    onClick={() => fetchLiveFromGitHub()}
                    disabled={liveLoading}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:border-blue-300 ${liveLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {liveLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                    Live GitHub fetch
                  </button>
                  <button
                    onClick={downloadAssignmentsCsv}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:border-emerald-300"
                  >
                    <Download size={16} /> Download as CSV
                  </button>
                </div>
              </div>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Total Teams</p>
                    <p className="text-3xl font-bold text-slate-800">{totalTeams}</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <Users className="text-blue-600" size={24} />
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Forks Detected</p>
                    <p className="text-3xl font-bold text-slate-800">{forks}</p>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <GitFork className="text-orange-600" size={24} />
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Active Repos</p>
                    <p className="text-3xl font-bold text-slate-800">{activeRepos}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <CheckCircle2 className="text-green-600" size={24} />
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Stale / No Commits</p>
                    <p className="text-3xl font-bold text-slate-800">{staleTeams}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <Clock3 className="text-red-600" size={24} />
                  </div>
                </div>
              </div>
            </div>

            {/* Charts: 4-up, uniform sizing */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Latest Commits (Top 10)</h3>
                  <span className="text-xs text-slate-500">Most recent first</span>
                </div>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {activityData.length === 0 && (
                    <div className="text-sm text-slate-500">No recent commits.</div>
                  )}
                  {activityData.map(item => (
                    <div key={item.name + item.timestamp} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                        <a href={item.repo} target="_blank" rel="noreferrer" className="text-xs text-blue-600 truncate hover:underline">
                          {item.repo}
                        </a>
                      </div>
                      <div className="text-right text-xs text-slate-600 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{item.label}</div>
                        <div>{item.recency}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">4h Commitment Check</h3>
                  <span className="text-xs text-slate-500">Every team should commit once in 4h</span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sixHourData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#22c55e">
                        <Cell key="on-pace" fill="#22c55e" />
                        <Cell key="late" fill="#f97316" />
                        <Cell key="none" fill="#94a3b8" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-semibold mb-4">Repository Types</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={forkData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={5} dataKey="value">
                        {forkData.map((entry, index) => (
                          <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 mt-4 text-sm text-slate-600">
                  {forkData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      {entry.name} ({entry.value})
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Commit Recency</h3>
                  <span className="text-xs text-slate-500">Newer is better</span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={recencyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#0ea5e9" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Team Details</h2>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                    <Filter size={16} className="text-slate-500" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search team..."
                      className="bg-transparent outline-none text-sm text-slate-800"
                    />
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="all">All statuses</option>
                    {uniqueStatuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                  <select
                    value={forkFilter}
                    onChange={(e) => setForkFilter(e.target.value as 'all' | 'fork' | 'original')}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="all">Forks + originals</option>
                    <option value="original">Originals only</option>
                    <option value="fork">Forks only</option>
                  </select>
                  <select
                    value={preexistingFilter}
                    onChange={(e) => setPreexistingFilter(e.target.value as 'all' | 'pre' | 'fresh')}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="all">All creation dates</option>
                    <option value="fresh">Created during hackathon</option>
                    <option value="pre">Pre-existing before hackathon</option>
                  </select>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="all">All classes</option>
                    {classOptions.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                    <option value="Unassigned">Unassigned</option>
                  </select>
                  <select
                    value={sixHourFilter}
                    onChange={(e) => setSixHourFilter(e.target.value as 'all' | 'onpace' | 'late' | 'none')}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="all">All activity</option>
                    <option value="onpace">Committed in last 4h</option>
                    <option value="late">No commit in 4h</option>
                    <option value="none">No commits yet</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'recent' | 'name')}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="recent">Sort by latest commit</option>
                    <option value="name">Sort by team name</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span className="px-3 py-2 rounded-lg bg-slate-100">Showing {filteredTeams.length} teams</span>
                  <button
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setForkFilter('all');
                      setPreexistingFilter('all');
                      setClassFilter('all');
                      setSixHourFilter('all');
                      setSortBy('recent');
                    }}
                  >
                    Reset filters
                  </button>
                  <button
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 ${dataLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    onClick={fetchTeams}
                    disabled={dataLoading}
                  >
                    {dataLoading ? <Loader2 size={16} className="animate-spin" /> : <Clock3 size={16} />} Refresh
                  </button>
                  <button
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:border-blue-300 ${liveLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    onClick={() => fetchLiveFromGitHub()}
                    disabled={liveLoading}
                  >
                    {liveLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />} Live GitHub fetch
                  </button>
                  <button
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:border-emerald-300 ${liveLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    onClick={() => fetchLiveFromGitHub(filteredTeams)}
                    disabled={liveLoading || filteredTeams.length === 0}
                  >
                    {liveLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />} Refresh this class
                  </button>
                  <button
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                    onClick={() => {
                      setAddFormOpen(true);
                      setAddError(null);
                    }}
                  >
                    <Plus size={16} /> Add Team
                  </button>
                  <a
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white"
                    href={reportJsonUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} /> JSON
                  </a>
                  <a
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800"
                    href={reportCsvUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} /> CSV
                  </a>
                </div>
              </div>
            </div>
            {addFormOpen && (
              <div className="bg-white p-5 rounded-xl shadow-sm border border-blue-100 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">Add Team</h3>
                    <p className="text-sm text-slate-500">Register a new team to start tracking it.</p>
                  </div>
                  <button
                    aria-label="Close add team form"
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-600"
                    onClick={() => {
                      setAddFormOpen(false);
                      setAddError(null);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {addError && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {addError}
                  </div>
                )}

                <form
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTeam();
                  }}
                >
                  <label className="flex flex-col gap-1 text-sm text-slate-700">
                    Team Name
                    <input
                      value={addForm.name}
                      onChange={(e) => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Example Team"
                      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-slate-700">
                    Repository URL
                    <input
                      value={addForm.repo}
                      onChange={(e) => setAddForm(prev => ({ ...prev, repo: e.target.value }))}
                      placeholder="https://github.com/org/repo"
                      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="url"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-slate-700">
                    Status
                    <select
                      value={addForm.status}
                      onChange={(e) => setAddForm(prev => ({ ...prev, status: e.target.value }))}
                      className="px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {statusOptions.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-slate-700">
                    Latest Commit (optional)
                    <input
                      value={addForm.latestCommit}
                      onChange={(e) => setAddForm(prev => ({ ...prev, latestCommit: e.target.value }))}
                      type="datetime-local"
                      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={addForm.isFork}
                      onChange={(e) => setAddForm(prev => ({ ...prev, isFork: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Mark as forked repository
                  </label>

                  <div className="flex items-center gap-3 md:col-span-2">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                    >
                      <Plus size={16} /> Add team
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300"
                      onClick={() => {
                        setAddForm({ name: '', repo: '', status: 'Success', isFork: false, latestCommit: '' });
                        setAddError(null);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Team List */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                  <h3 className="font-semibold text-slate-700">Select Team</h3>
                </div>
                <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                  {filteredTeams.map((team) => (
                    <button
                      key={team["Team Name"]}
                      onClick={() => setSelectedTeam(team["Team Name"])}
                      className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                        selectedTeam === team["Team Name"] ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{team["Team Name"]}</p>
                          <p className="text-xs text-slate-500 truncate">{team["Repository URL"]}</p>
                        </div>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">{team["Class"] || 'Unassigned'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Team Detail View */}
              <div className="lg:col-span-2">
                {selectedTeam && (
                  <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
                    {(() => {
                      const team = data.find(t => t["Team Name"] === selectedTeam)!;
                      const isFork = team["Is Fork"];
                      const createdDate = team["Created At"] ? parseISO(team["Created At"]) : null;
                      const latestCommit = team["Latest Commit Date"] ? parseISO(team["Latest Commit Date"]) : null;
                        const isPreExisting = createdDate && createdDate < hackathonStart;

                      return (
                        <div className="space-y-6">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-2xl font-bold text-slate-800 mb-1">{team["Team Name"]}</h3>
                              <a 
                                href={team["Repository URL"]} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1 text-sm"
                              >
                                {team["Repository URL"]}
                                <ExternalLink size={14} />
                              </a>
                            </div>
                            <div className="flex gap-2 flex-wrap justify-end">
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                team["Status"] === 'Success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {team["Status"]}
                              </span>
                              <span className="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-700">{formatRecency(team["Latest Commit Date"])} update</span>
                              <button
                                onClick={() => fetchCommits(team)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:border-slate-300 text-sm"
                              >
                                <List size={16} /> View commits
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className={`p-4 rounded-lg border ${isFork ? 'bg-orange-50 border-orange-100' : 'bg-green-50 border-green-100'}`}>
                              <p className={`text-sm mb-1 ${isFork ? 'text-orange-600' : 'text-green-600'}`}>Repository Type</p>
                              <div className="flex items-center gap-2">
                                {isFork ? (
                                  <>
                                    <GitFork className="text-orange-600" size={24} />
                                    <div>
                                      <span className="font-bold text-orange-700 block">Forked Repository</span>
                                      <span className="text-xs text-orange-600">Copied from an existing project.</span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="text-green-600" size={24} />
                                    <div>
                                      <span className="font-bold text-green-700 block">Original Repository</span>
                                      <span className="text-xs text-green-600">Created as a standalone repo.</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className={`p-4 rounded-lg border ${isPreExisting ? 'bg-yellow-50 border-yellow-100' : 'bg-blue-50 border-blue-100'}`}>
                              <p className={`text-sm mb-1 ${isPreExisting ? 'text-yellow-600' : 'text-blue-600'}`}>Creation Status</p>
                              {isPreExisting ? (
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="text-yellow-600" size={24} />
                                  <div>
                                    <span className="font-bold text-yellow-700 block">Pre-existing Project</span>
                                    <span className="text-xs text-yellow-600">Created before hackathon start.</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="text-blue-600" size={24} />
                                  <div>
                                    <span className="font-bold text-blue-700 block">Fresh Project</span>
                                    <span className="text-xs text-blue-600">Born during the hackathon.</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="p-4 rounded-lg border bg-slate-50 border-slate-100">
                              <p className="text-sm mb-1 text-slate-600">Latest Commit</p>
                              <div className="flex items-center gap-2">
                                <Clock3 className="text-slate-600" size={24} />
                                <div>
                                  <span className="font-bold text-slate-800 block">{latestCommit ? format(latestCommit, 'PPP p') : 'N/A'}</span>
                                  <span className="text-xs text-slate-500">{formatRecency(team["Latest Commit Date"])} </span>
                                </div>
                              </div>
                            </div>
                            <div className="p-4 rounded-lg border bg-purple-50 border-purple-100">
                              <p className="text-sm mb-1 text-purple-700">Hackathon start date/time</p>
                              <div className="flex items-center gap-2">
                                <Clock3 className="text-purple-700" size={24} />
                                <div>
                                  <span className="font-bold text-purple-800 block">{format(hackathonStart, 'PPP p')}</span>
                                  <span className="text-xs text-purple-700">{isPreExisting ? 'Repository predates hackathon (pre-existing)' : 'Repo created on/after start'}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-slate-100 pt-6">
                            <h4 className="font-semibold text-slate-800 mb-4">Activity Timeline</h4>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg">
                                <span className="text-slate-600">Created At</span>
                                <span className="font-mono text-slate-800">
                                  {createdDate ? format(createdDate, 'PPP p') : 'N/A'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg">
                                <span className="text-slate-600">Latest Commit</span>
                                <span className="font-mono text-slate-800">
                                  {latestCommit ? format(latestCommit, 'PPP p') : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {commitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-3xl max-h-[80vh] rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Commit history</p>
                <p className="text-lg font-semibold text-slate-900">{commitTeam}</p>
              </div>
              <button
                onClick={() => setCommitModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-600"
                aria-label="Close commit history"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {commitLoading && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Loader2 className="animate-spin" size={18} />
                  <span>Loading commits...</span>
                </div>
              )}
              {commitError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                  {commitError}
                </div>
              )}
              {!commitLoading && !commitError && commitList.length === 0 && (
                <div className="text-sm text-slate-600">No commits found.</div>
              )}
              {!commitLoading && !commitError && commitList.length > 0 && (
                <div className="space-y-3">
                  {commitList.map((c) => (
                    <a
                      key={c.sha}
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 p-3 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{c.message}</p>
                          <p className="text-xs text-slate-500 truncate">{c.sha}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 whitespace-nowrap">
                          <div>{c.author}</div>
                          <div>{c.date ? format(parseISO(c.date), 'PPpp') : 'Unknown date'}</div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ManualAdderProps = {
  onAdd: (name: string, repo: string) => void;
};

function ManualAdder({ onAdd }: ManualAdderProps) {
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name.trim(), repo.trim());
        setName('');
        setRepo('');
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Team Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team Falcon"
          className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Repository URL
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="https://github.com/org/repo"
          className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </label>
      <button
        type="submit"
        className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm w-full"
      >
        Add team
      </button>
    </form>
  );
}

export default App;
