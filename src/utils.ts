import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execSync } from 'child_process';

export interface User {
  name: string;
  email: string;
}

export interface Todo {
  file: string;
  line: number;
  column?: number; // Add column position for multiple todos per line
  type: 'local' | 'remote';
  message: string;
  id?: string; // Add unique ID for multiple todos per line
  // Remote todo specific fields
  author?: User;
  assignees?: User[];
  createdAt?: string;
  updatedAt?: string;
}

function getWorkspaceFolderForFile(filePath: string): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.find(folder =>
    filePath.startsWith(folder.uri.fsPath)
  ) || vscode.workspace.workspaceFolders?.[0];
}

export async function loadTodos(filePath?: string): Promise<Todo[]> {
  const workspaceFolder = filePath ? getWorkspaceFolderForFile(filePath) : vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found.');
    return [];
  }

  const todoFile = path.join(workspaceFolder.uri.fsPath, '.localtodos.json');
  try {
    if (!fs.existsSync(todoFile)) {
      return [];
    }
    const data = fs.readFileSync(todoFile, 'utf8');
    const todos = JSON.parse(data);
    return Array.isArray(todos) ? todos : [];
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to load TODOs: ${error}`);
    return [];
  }
}

export async function saveTodos(todos: Todo[], filePath?: string): Promise<void> {
  const workspaceFolder = filePath ? getWorkspaceFolderForFile(filePath) : vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found.');
    return;
  }

  const todoFile = path.join(workspaceFolder.uri.fsPath, '.localtodos.json');
  try {
    fs.writeFileSync(todoFile, JSON.stringify(todos, null, 2));
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to save TODOs: ${error}`);
  }
}

// Git integration functions
export function getGitUserInfo(): User | null {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    const gitName = execSync('git config user.name', { cwd: workspaceFolder.uri.fsPath, encoding: 'utf8' }).trim();
    const gitEmail = execSync('git config user.email', { cwd: workspaceFolder.uri.fsPath, encoding: 'utf8' }).trim();

    if (gitName && gitEmail) {
      return { name: gitName, email: gitEmail };
    }
  } catch (error) {
    // Git not configured or not a git repository
    vscode.window.showWarningMessage('Git user name/email not configured. Please configure git first.');
  }
  return null;
}

// Remote todo storage functions
export async function loadRemoteTodos(filePath?: string): Promise<Todo[]> {
  const workspaceFolder = filePath ? getWorkspaceFolderForFile(filePath) : vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found.');
    return [];
  }

  const remoteTodoFile = path.join(workspaceFolder.uri.fsPath, '.remotetodos.json');
  try {
    if (!fs.existsSync(remoteTodoFile)) {
      return [];
    }
    const data = fs.readFileSync(remoteTodoFile, 'utf8');
    const todos = JSON.parse(data);
    return Array.isArray(todos) ? todos : [];
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to load remote TODOs: ${error}`);
    return [];
  }
}

export async function saveRemoteTodos(todos: Todo[], filePath?: string): Promise<void> {
  const workspaceFolder = filePath ? getWorkspaceFolderForFile(filePath) : vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found.');
    return;
  }

  const remoteTodoFile = path.join(workspaceFolder.uri.fsPath, '.remotetodos.json');
  try {
    fs.writeFileSync(remoteTodoFile, JSON.stringify(todos, null, 2));
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to save remote TODOs: ${error}`);
  }
}

// Filter remote todos based on user visibility
export function filterVisibleRemoteTodos(todos: Todo[], userEmail: string): Todo[] {
  return todos.filter(todo =>
    todo.type === 'remote' &&
    (todo.author?.email === userEmail || todo.assignees?.some(assignee => assignee.email === userEmail))
  );
}

// Team management functions
export async function loadTeamMembers(filePath?: string): Promise<User[]> {
  const workspaceFolder = filePath ? getWorkspaceFolderForFile(filePath) : vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return [];
  }

  const teamFile = path.join(workspaceFolder.uri.fsPath, '.awesometeam.json');
  try {
    if (!fs.existsSync(teamFile)) {
      return [];
    }
    const data = fs.readFileSync(teamFile, 'utf8');
    const team = JSON.parse(data);
    return Array.isArray(team) ? team : [];
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to load team members: ${error}`);
    return [];
  }
}

export async function saveTeamMembers(team: User[], filePath?: string): Promise<void> {
  const workspaceFolder = filePath ? getWorkspaceFolderForFile(filePath) : vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found.');
    return;
  }

  const teamFile = path.join(workspaceFolder.uri.fsPath, '.awesometeam.json');
  try {
    fs.writeFileSync(teamFile, JSON.stringify(team, null, 2));
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to save team members: ${error}`);
  }
}

export async function addTeamMember(name: string, email: string): Promise<boolean> {
  const existingTeam = await loadTeamMembers();
  const isDuplicate = existingTeam.some(member => member.email === email);

  if (isDuplicate) {
    vscode.window.showWarningMessage(`Team member with email ${email} already exists.`);
    return false;
  }

  const newMember: User = { name, email };
  existingTeam.push(newMember);
  await saveTeamMembers(existingTeam);
  return true;
}

export async function removeTeamMember(email: string): Promise<boolean> {
  const existingTeam = await loadTeamMembers();
  const filteredTeam = existingTeam.filter(member => member.email !== email);

  if (filteredTeam.length === existingTeam.length) {
    vscode.window.showWarningMessage(`Team member with email ${email} not found.`);
    return false;
  }

  await saveTeamMembers(filteredTeam);
  return true;
}
