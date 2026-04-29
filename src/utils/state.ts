import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AppState } from '../types';

const STATE_DIR = path.join(os.homedir(), '.cmps');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

export function saveState(state: AppState): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function loadState(): AppState | null {
  try {
    const content = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(content) as AppState;
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // ignore if already gone
  }
}
