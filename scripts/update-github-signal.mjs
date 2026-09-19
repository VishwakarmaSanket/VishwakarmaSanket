import fs from 'node:fs/promises';

const owner = process.env.GITHUB_OWNER || process.env.GITHUB_REPOSITORY_OWNER || 'VishwakarmaSanket';
const token = process.env.GITHUB_TOKEN;

if (!token) throw new Error('GITHUB_TOKEN is required');

const end = new Date();
const start = new Date(end);
start.setDate(start.getDate() - 365);
const iso = (d) => d.toISOString();

const query = `query($login:String!, $from:DateTime!, $to:DateTime!) {
  user(login:$login) {
    contributionsCollection(from:$from,to:$to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount }
        }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    authorization: `bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'sanket-github-readme-signal'
  },
  body: JSON.stringify({ variables: { login: owner, from: iso(start), to: iso(end) }, query })
});

if (!res.ok) throw new Error(`GitHub GraphQL failed: ${res.status}`);
const body = await res.json();
if (body.errors?.length) throw new Error(body.errors.map(e => e.message).join('; '));

const calendar = body.data.user.contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap(w => w.contributionDays);
const byDate = new Map(days.map(d => [d.date, d.contributionCount]));

let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (current) break;
}

let longest = 0, run = 0;
for (const d of days) {
  if (d.contributionCount > 0) { run++; longest = Math.max(longest, run); }
  else run = 0;
}

const svgPath = 'assets/github-signal.svg';
let svg = await fs.readFile(svgPath, 'utf8');
svg = svg.replace('>SYNCING<', `>${calendar.totalContributions}<`)
  .replace('>—<', `>${current}<`)
  .replace('>—<', `>${longest}<`)
  .replace('Awaiting first sync', `Updated ${new Date().toISOString().slice(0,10)}`);

const max = Math.max(...days.map(d => d.contributionCount), 1);
const level = (n) => {
  if (!n) return '#2a313a';
  const p = n / max;
  if (p < .2) return '#4f59a6';
  if (p < .45) return '#6875d8';
  if (p < .7) return '#8792ff';
  return '#9da7ff';
};

const allCells = [...svg.matchAll(/<rect class="cell" data-week="(\d+)" data-day="(\d+)"([^>]*)\/>/g)];
for (const m of allCells) {
  const week = Number(m[1]);
  const day = Number(m[2]);
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() + week * 7);
  const date = new Date(weekStart);
  date.setDate(date.getDate() + day);
  const key = date.toISOString().slice(0, 10);
  const fill = level(byDate.get(key) || 0);
  svg = svg.replace(m[0], `<rect class="cell" data-week="${week}" data-day="${day}"${m[3]} fill="${fill}"/>`);
}

await fs.writeFile(svgPath, svg);
console.log(`Updated signal for ${owner}: ${calendar.totalContributions} contributions, current ${current}, longest ${longest}.`);
