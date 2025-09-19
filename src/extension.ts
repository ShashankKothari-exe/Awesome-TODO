import * as vscode from "vscode";
import { TodoCodeActionProvider } from "./provider";
import { Todo, loadTodos, saveTodos, loadRemoteTodos, saveRemoteTodos, getGitUserInfo, filterVisibleRemoteTodos, User, loadTeamMembers, addTeamMember, removeTeamMember } from "./utils";

class TodoCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    // Check for TODO comments that can be converted
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const lineText = line.text.trim();

      // Check if this line has a TODO comment
      if (/^((\/\/)|#)\s*TODO[:\-]?\s*/i.test(lineText)) {
        const range = new vscode.Range(i, 0, i, line.text.length);

        // Create CodeLens for local conversion
        const localConvertLens = new vscode.CodeLens(range, {
          title: "Convert to Local TODO",
          tooltip: "Convert this TODO comment to a local TODO item",
          command: 'localTodo.convertTodo',
          arguments: [document, i, lineText]
        });

        // Create CodeLens for remote conversion
        const remoteConvertLens = new vscode.CodeLens(range, {
          title: "Convert to Remote TODO",
          tooltip: "Convert this TODO comment to a remote TODO item",
          command: 'remoteTodo.convertTodo',
          arguments: [document, i, lineText]
        });

        codeLenses.push(localConvertLens, remoteConvertLens);
      }
    }

    // Get user info for filtering remote todos
    const userInfo = getGitUserInfo();
    const userEmail = userInfo?.email || '';

    // Check for stored local TODOs
    const localTodos = await loadTodos(document.uri.fsPath);
    const fileLocalTodos = localTodos.filter(todo => todo.file === document.uri.fsPath);

    for (const todo of fileLocalTodos) {
      if (todo.line < document.lineCount) {
        const line = document.lineAt(todo.line);
        const range = new vscode.Range(todo.line, 0, todo.line, line.text.length);

        // Create display CodeLens with TODO message
        const displayLens = new vscode.CodeLens(range, {
          title: `📝 TODO: ${todo.message}`,
          tooltip: `Local TODO: ${todo.message}`,
          command: '' // Non-clickable display
        });

        // Create individual clickable action buttons
        const editLens = new vscode.CodeLens(range, {
          title: "✏️ Edit",
          tooltip: "Convert back to comment and remove from storage",
          command: 'localTodo.editTodo',
          arguments: [document, todo.line, todo]
        });

        const moveLens = new vscode.CodeLens(range, {
          title: "📍 Move",
          tooltip: "Move this TODO to another line",
          command: 'localTodo.moveTodo',
          arguments: [document, todo.line, todo]
        });

        const removeLens = new vscode.CodeLens(range, {
          title: "🗑️ Remove",
          tooltip: "Delete this TODO permanently",
          command: 'localTodo.removeTodo',
          arguments: [document, todo.line, todo]
        });

        // Add display lens and action buttons
        codeLenses.push(displayLens, editLens, moveLens, removeLens);
      }
    }

    // Check for stored remote TODOs (filtered by user visibility)
    const allRemoteTodos = await loadRemoteTodos(document.uri.fsPath);
    const visibleRemoteTodos = filterVisibleRemoteTodos(allRemoteTodos, userEmail).filter(todo => todo.file === document.uri.fsPath);

    for (const todo of visibleRemoteTodos) {
      if (todo.line < document.lineCount) {
        const line = document.lineAt(todo.line);
        const range = new vscode.Range(todo.line, 0, todo.line, line.text.length);

        // Create display CodeLens with remote TODO message
        const authorName = todo.author?.name || 'Unknown';
        const assigneeNames = todo.assignees?.map(a => a.name).join(', ') || 'None';
        const displayLens = new vscode.CodeLens(range, {
          title: `🌐 TODO: ${todo.message}`,
          tooltip: `Remote TODO by ${authorName}\nAssignees: ${assigneeNames}`,
          command: '' // Non-clickable display
        });

        // Create individual clickable action buttons for remote todos
        const editLens = new vscode.CodeLens(range, {
          title: "✏️ Edit",
          tooltip: "Edit this remote TODO",
          command: 'remoteTodo.editTodo',
          arguments: [document, todo.line, todo]
        });

        const assignLens = new vscode.CodeLens(range, {
          title: "👤 Assign",
          tooltip: "Add assignee to this remote TODO",
          command: 'remoteTodo.assignTodo',
          arguments: [document, todo.line, todo]
        });

        const moveLens = new vscode.CodeLens(range, {
          title: "📍 Move",
          tooltip: "Move this remote TODO to another line",
          command: 'remoteTodo.moveTodo',
          arguments: [document, todo.line, todo]
        });

        const removeLens = new vscode.CodeLens(range, {
          title: "🗑️ Remove",
          tooltip: "Delete this remote TODO permanently",
          command: 'remoteTodo.removeTodo',
          arguments: [document, todo.line, todo]
        });

        // Create author information lens
        const authorLens = new vscode.CodeLens(range, {
          title: `~~~Author: ${authorName}~~~`,
          tooltip: `Created by ${authorName}`,
          command: '' // Non-clickable display
        });

        // Add display lens, action buttons, and author info
        codeLenses.push(displayLens, editLens, assignLens, moveLens, removeLens, authorLens);
      }
    }

    return codeLenses;
  }

  // Method to refresh CodeLens
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}

let decorationType: vscode.TextEditorDecorationType;
let refreshTimeout: NodeJS.Timeout | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarUpdateTimeout: NodeJS.Timeout | undefined;

// Performance optimization: Cache for TODO data
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class TodoCache {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 2000; // 2 seconds

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

const todoCache = new TodoCache();

export function activate(context: vscode.ExtensionContext) {
  // Create diagnostic collection for TODOs
  diagnosticCollection = vscode.languages.createDiagnosticCollection('localTodos');
  context.subscriptions.push(diagnosticCollection);

  // Register CodeLens provider
  const codeLensProvider = new TodoCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider('*', codeLensProvider)
  );

  decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: "", // Will be set dynamically
      color: "rgba(255, 165, 0, 0.9)",
      fontStyle: "italic",
      fontWeight: "normal",
    },
    backgroundColor: "rgba(255, 165, 0, 0.1)", // Subtle orange background
    isWholeLine: false,
  });

  vscode.languages.registerCodeActionsProvider(
    "*",
    new TodoCodeActionProvider(),
    {
      providedCodeActionKinds: TodoCodeActionProvider.providedCodeActionKinds,
    }
  );

  // Auto-manage .gitignore for local files
  ensureGitIgnoreEntries();

  // Register Advanced Hover Provider for custom widget-like display
  vscode.languages.registerHoverProvider('*', {
    async provideHover(document, position, token) {
      // Check if this line has a stored local TODO
      const todos = await loadTodos(document.uri.fsPath);
      const lineTodos = todos.filter(todo => todo.line === position.line);

      if (lineTodos.length > 0) {
        const todo = lineTodos[0]; // Show first TODO on this line

        // Create advanced widget-like HTML content
        const hoverContent = new vscode.MarkdownString();
        hoverContent.supportHtml = true;
        hoverContent.value = `
<div style="position: relative; z-index: 1000; max-width: 400px;">
  <div style="padding: 16px; border-radius: 12px; background: linear-gradient(135deg, #fff9c4 0%, #ffeb3b 20%, #fff8e1 100%); border: 3px solid #ff6f00; box-shadow: 0 4px 20px rgba(255, 111, 0, 0.3); margin-bottom: 8px;">
    <div style="font-size: 18px; font-weight: bold; color: #e65100; margin-bottom: 16px; text-align: center; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">
      🔸 Local TODO: ${todo.message}
    </div>
    <div style="background: rgba(255, 255, 255, 0.8); padding: 12px; border-radius: 8px; border: 1px solid #ffb74d;">
      <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
        <div style="background: linear-gradient(45deg, #4caf50, #66bb6a); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3); cursor: pointer;" onclick="vscode.commands.executeCommand('localTodo.editTodo', '${document.uri}', ${position.line}, ${JSON.stringify(todo).replace(/"/g, '"')})">
          ✏️ Edit
        </div>
        <div style="background: linear-gradient(45deg, #2196f3, #42a5f5); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3); cursor: pointer;" onclick="vscode.commands.executeCommand('localTodo.moveTodo', '${document.uri}', ${position.line}, ${JSON.stringify(todo).replace(/"/g, '"')})">
          📍 Move
        </div>
        <div style="background: linear-gradient(45deg, #f44336, #ef5350); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(244, 67, 54, 0.3); cursor: pointer;" onclick="vscode.commands.executeCommand('localTodo.removeTodo', '${document.uri}', ${position.line}, ${JSON.stringify(todo).replace(/"/g, '"')})">
          🗑️ Remove
        </div>
      </div>
    </div>
  </div>
</div>`;

        const line = document.lineAt(position.line);
        return new vscode.Hover(hoverContent, new vscode.Range(position.line, 0, position.line, line.text.length));
      }

      // Check if this line has a stored remote TODO
      const userInfo = getGitUserInfo();
      const userEmail = userInfo?.email || '';
      const allRemoteTodos = await loadRemoteTodos(document.uri.fsPath);
      const visibleRemoteTodos = filterVisibleRemoteTodos(allRemoteTodos, userEmail).filter(todo => todo.line === position.line);

      if (visibleRemoteTodos.length > 0) {
        const todo = visibleRemoteTodos[0]; // Show first remote TODO on this line
        const authorName = todo.author?.name || 'Unknown';
        const assigneeNames = todo.assignees?.map(a => a.name).join(', ') || 'None';

        // Create advanced widget-like HTML content for remote TODOs
        const hoverContent = new vscode.MarkdownString();
        hoverContent.supportHtml = true;
        hoverContent.value = `
<div style="position: relative; z-index: 1000; max-width: 400px;">
  <div style="padding: 16px; border-radius: 12px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 20%, #90caf9 100%); border: 3px solid #1976d2; box-shadow: 0 4px 20px rgba(25, 118, 210, 0.3); margin-bottom: 8px;">
    <div style="font-size: 18px; font-weight: bold; color: #0d47a1; margin-bottom: 8px; text-align: center; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">
      🌐 Remote TODO: ${todo.message}
    </div>
    <div style="font-size: 14px; color: #1565c0; margin-bottom: 16px; text-align: center;">
      👤 Author: ${authorName} | 👥 Assignees: ${assigneeNames}
    </div>
    <div style="background: rgba(255, 255, 255, 0.8); padding: 12px; border-radius: 8px; border: 1px solid #64b5f6;">
      <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
        <div style="background: linear-gradient(45deg, #4caf50, #66bb6a); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3); cursor: pointer;" onclick="vscode.commands.executeCommand('remoteTodo.editTodo', '${document.uri}', ${position.line}, ${JSON.stringify(todo).replace(/"/g, '"')})">
          ✏️ Edit
        </div>
        <div style="background: linear-gradient(45deg, #2196f3, #42a5f5); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3); cursor: pointer;" onclick="vscode.commands.executeCommand('remoteTodo.assignTodo', '${document.uri}', ${position.line}, ${JSON.stringify(todo).replace(/"/g, '"')})">
          👤 Assign
        </div>
        <div style="background: linear-gradient(45deg, #ff9800, #ffb74d); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(255, 152, 0, 0.3); cursor: pointer;" onclick="vscode.commands.executeCommand('remoteTodo.moveTodo', '${document.uri}', ${position.line}, ${JSON.stringify(todo).replace(/"/g, '"')})">
          📍 Move
        </div>
        <div style="background: linear-gradient(45deg, #f44336, #ef5350); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(244, 67, 54, 0.3); cursor: pointer;" onclick="vscode.commands.executeCommand('remoteTodo.removeTodo', '${document.uri}', ${position.line}, ${JSON.stringify(todo).replace(/"/g, '"')})">
          🗑️ Remove
        </div>
      </div>
    </div>
  </div>
</div>`;

        const line = document.lineAt(position.line);
        return new vscode.Hover(hoverContent, new vscode.Range(position.line, 0, position.line, line.text.length));
      }

      return null;
    }
  });

  let disposable = vscode.commands.registerCommand(
    "localTodo.convertTodo",
    async (document: vscode.TextDocument, lineNumber: number, text: string) => {
      const file = document.uri.fsPath;
      const line = document.lineAt(lineNumber);
      const lineText = line.text;

      // Extract all TODO comments from the line
      const todoRegex =
        /((\/\/)|#)\s*TODO[:\-]?\s*(.*?)(?=(\/\/|#)\s*TODO[:\-]?|$)/gi;
      const todos: Todo[] = [];
      let match;

      while ((match = todoRegex.exec(lineText)) !== null) {
        const message = match[3].trim();
        if (message) {
          const todo: Todo = {
            file,
            line: lineNumber, // Keep original line number
            column: match.index,
            type: "local",
            message,
            id: `${file}:${lineNumber}:${match.index}`,
          };
          todos.push(todo);
        }
      }

      if (todos.length === 0) {
        // Fallback for single TODO if regex doesn't match
        const message = text.replace(/^((\/\/)|#)\s*TODO[:-]?\s*/i, "").trim();
        const todo: Todo = {
          file,
          line: lineNumber, // Keep original line number
          type: "local",
          message,
          id: `${file}:${lineNumber}:0`,
        };
        todos.push(todo);
      }

      // Load existing todos and add new ones
      const existingTodos = await loadTodos(file);
      const updatedTodos = [...existingTodos, ...todos];
      await saveTodos(updatedTodos, file);

      // Clear cache for this file
      todoCache.clear();

      // Smart line removal: remove entire line if it only contains the TODO comment
      const edit = new vscode.WorkspaceEdit();
      const originalLineText = line.text;

      // Check if line is empty except for the TODO comment
      const commentRegex = /^(\s*)((\/\/)|#)\s*TODO[:\-]?.*$/i;
      const isOnlyTodoComment = commentRegex.test(originalLineText.trim());

      if (isOnlyTodoComment) {
        // Remove the entire line if it only contains the TODO comment
        edit.delete(document.uri, line.rangeIncludingLineBreak || line.range);
      } else {
        // Remove only the TODO comment part, keep the rest of the line
        const todoCommentMatch = originalLineText.match(/((\/\/)|#)\s*TODO[:\-]?.*$/i);
        if (todoCommentMatch) {
          const commentStart = originalLineText.indexOf(todoCommentMatch[0]);
          const commentEnd = commentStart + todoCommentMatch[0].length;
          const rangeToDelete = new vscode.Range(lineNumber, commentStart, lineNumber, commentEnd);
          edit.delete(document.uri, rangeToDelete);
        }
      }

      await vscode.workspace.applyEdit(edit);

      // Refresh decorations
      debouncedRefreshDecorations();
    }
  );

  let listDisposable = vscode.commands.registerCommand(
    "localTodo.listTodos",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
      }

      const todos = await loadTodos();
      if (todos.length === 0) {
        vscode.window.showInformationMessage("No local TODOs found.");
        return;
      }

      const items = todos.map((todo) => ({
        label: `${vscode.workspace.asRelativePath(todo.file)}:${todo.line + 1}`,
        description: todo.message,
        todo,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a TODO to view",
      });

      if (selected) {
        const uri = vscode.Uri.file(selected.todo.file);
        const position = new vscode.Position(selected.todo.line, 0);
        await vscode.window.showTextDocument(uri, {
          selection: new vscode.Range(position, position),
        });
      }
    }
  );

  let listAllTodosDisposable = vscode.commands.registerCommand(
    "awesomeTodo.listAllTodos",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
      }

      // Load both local and remote TODOs
      const localTodos = await loadTodos();
      const userInfo = getGitUserInfo();
      const userEmail = userInfo?.email || '';
      const allRemoteTodos = await loadRemoteTodos();
      const visibleRemoteTodos = filterVisibleRemoteTodos(allRemoteTodos, userEmail);

      const allTodos = [...localTodos, ...visibleRemoteTodos];

      if (allTodos.length === 0) {
        vscode.window.showInformationMessage("No TODOs found.");
        return;
      }

      const items = allTodos.map((todo) => {
        const isRemote = todo.type === 'remote';
        const authorName = isRemote ? (todo.author?.name || 'Unknown') : '';
        const label = `${vscode.workspace.asRelativePath(todo.file)}:${todo.line + 1}`;
        const description = isRemote ? `${todo.message} (by ${authorName})` : todo.message;
        const detail = isRemote ? `Remote TODO - Assignees: ${todo.assignees?.map(a => a.name).join(', ') || 'None'}` : 'Local TODO';

        return {
          label,
          description,
          detail,
          todo,
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a TODO to view",
        matchOnDescription: true
      });

      if (selected) {
        const uri = vscode.Uri.file(selected.todo.file);
        const position = new vscode.Position(selected.todo.line, 0);
        await vscode.window.showTextDocument(uri, {
          selection: new vscode.Range(position, position),
        });
      }
    }
  );

  let removeDisposable = vscode.commands.registerCommand(
    "localTodo.removeTodo",
    async (document: vscode.TextDocument, lineNumber: number, todo: Todo) => {
      // Remove the specific TODO directly using file and line (same as edit function)
      const file = document.uri.fsPath;
      const todos = await loadTodos(file);
      const updatedTodos = todos.filter(
        (t) => !(t.file === file && t.line === lineNumber && t.message === todo.message)
      );
      await saveTodos(updatedTodos, file);

      // Refresh CodeLens, text decorations, and diagnostics immediately
      codeLensProvider.refresh();
      refreshDecorations();
      updateDiagnostics();

      vscode.window.showInformationMessage(`TODO "${todo.message}" removed.`);
    }
  );

  let editDisposable = vscode.commands.registerCommand(
    "localTodo.editTodo",
    async (document: vscode.TextDocument, lineNumber: number, todo: Todo) => {
      const line = document.lineAt(lineNumber);
      const indentMatch = /^(\s*)/.exec(line.text);
      const indent = indentMatch ? indentMatch[1] : "";
      const commentPrefix = document.languageId === "python" ? "#" : "//";
      const todoComment = `${indent}${commentPrefix} TODO: ${todo.message}`;

      // Insert the permanent comment
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, line.range.start, todoComment + "\n");
      await vscode.workspace.applyEdit(edit);

      // Remove the todo from JSON storage
      const file = document.uri.fsPath;
      const todos = await loadTodos(file);
      const updatedTodos = todos.filter(
        (t) => !(t.file === file && t.line === lineNumber)
      );
      await saveTodos(updatedTodos, file);

      // Position cursor for editing
      const position = new vscode.Position(lineNumber, todoComment.length);
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document) {
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      }

      // Refresh CodeLens, text decorations, and diagnostics immediately
      codeLensProvider.refresh();
      refreshDecorations();
      updateDiagnostics();
    }
  );

  let editTodosInFileDisposable = vscode.commands.registerCommand(
    "localTodo.editTodosInFile",
    async (document: vscode.TextDocument) => {
      const todos = await loadTodos(document.uri.fsPath);
      const fileTodos = todos.filter(
        (todo) => todo.file === document.uri.fsPath
      );

      if (fileTodos.length === 0) {
        vscode.window.showInformationMessage(
          "No local TODOs found in this file."
        );
        return;
      }

      const items = fileTodos.map((todo) => ({
        label: `Line ${todo.line + 1}`,
        description: todo.message,
        todo,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a TODO to edit",
      });

      if (selected) {
        // Navigate to the line and trigger inline editing
        const position = new vscode.Position(selected.todo.line, 0);
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document) {
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position));
        }

        // Trigger the edit command
        await vscode.commands.executeCommand(
          "localTodo.editTodo",
          document,
          selected.todo.line,
          selected.todo
        );
      }
    }
  );

  let editTodosInLineDisposable = vscode.commands.registerCommand(
    "localTodo.editTodosInLine",
    async (
      document: vscode.TextDocument,
      lineNumber: number,
      lineTodos: Todo[]
    ) => {
      const items = lineTodos.map((todo) => ({
        label: todo.message,
        description: `Position: ${todo.column || 0}`,
        todo,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a TODO to edit from this line",
      });

      if (selected) {
        // Navigate to the line and trigger inline editing
        const position = new vscode.Position(selected.todo.line, 0);
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document) {
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position));
        }

        // Trigger the edit command
        await vscode.commands.executeCommand(
          "localTodo.editTodo",
          document,
          selected.todo.line,
          selected.todo
        );
      }
    }
  );

  let moveTodoDisposable = vscode.commands.registerCommand(
    "localTodo.moveTodo",
    async (document: vscode.TextDocument, lineNumber: number, todo: Todo) => {
      const input = await vscode.window.showInputBox({
        prompt: "Enter the line number to move this remote TODO on top of",
        placeHolder: "e.g., 15",
        validateInput: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num > document.lineCount) {
            return `Please enter a valid line number between 1 and ${document.lineCount}`;
          }
          return null;
        }
      });

      if (input) {
        const newLineNumber = parseInt(input) - 1; // Convert to 0-based

        // Update the todo's line number
        const file = document.uri.fsPath;
        const todos = await loadTodos(file);
        const todoIndex = todos.findIndex(t => t.id === todo.id);

        if (todoIndex !== -1) {
          todos[todoIndex].line = newLineNumber;
          await saveTodos(todos, file);

          // Refresh CodeLens, text decorations, and diagnostics immediately
          codeLensProvider.refresh();
          refreshDecorations();
          updateDiagnostics();

          vscode.window.showInformationMessage(`TODO moved to line ${newLineNumber + 1}`);
        }
      }
    }
  );

  // Remote TODO Commands
  let remoteConvertDisposable = vscode.commands.registerCommand(
    "remoteTodo.convertTodo",
    async (document: vscode.TextDocument, lineNumber: number, text: string) => {
      const userInfo = getGitUserInfo();
      if (!userInfo) {
        vscode.window.showErrorMessage("Git user information not available. Please configure git first.");
        return;
      }

      const file = document.uri.fsPath;
      const line = document.lineAt(lineNumber);
      const lineText = line.text;

      // Extract TODO message
      const message = text.replace(/^((\/\/)|#)\s*TODO[:-]?\s*/i, "").trim();
      if (!message) {
        vscode.window.showErrorMessage("No TODO message found.");
        return;
      }

      const now = new Date().toISOString();
      const todo: Todo = {
        file,
        line: lineNumber,
        type: "remote",
        message,
        id: `remote-${file}:${lineNumber}:${Date.now()}`,
        author: userInfo,
        assignees: [userInfo], // Author is also the first assignee
        createdAt: now,
        updatedAt: now,
      };

      // Load existing remote todos and add new one
      const existingTodos = await loadRemoteTodos(file);
      const updatedTodos = [...existingTodos, todo];
      await saveRemoteTodos(updatedTodos, file);

      // Clear cache for this file
      todoCache.clear();

      // Remove the TODO comment from code
      const edit = new vscode.WorkspaceEdit();
      const commentRegex = /^(\s*)((\/\/)|#)\s*TODO[:\-]?.*$/i;
      if (commentRegex.test(line.text.trim())) {
        edit.delete(document.uri, line.rangeIncludingLineBreak || line.range);
      } else {
        const todoCommentMatch = lineText.match(/((\/\/)|#)\s*TODO[:\-]?.*$/i);
        if (todoCommentMatch) {
          const commentStart = lineText.indexOf(todoCommentMatch[0]);
          const commentEnd = commentStart + todoCommentMatch[0].length;
          const rangeToDelete = new vscode.Range(lineNumber, commentStart, lineNumber, commentEnd);
          edit.delete(document.uri, rangeToDelete);
        }
      }

      await vscode.workspace.applyEdit(edit);

      // Refresh CodeLens
      codeLensProvider.refresh();

      vscode.window.showInformationMessage(`Remote TODO "${message}" created.`);
    }
  );

  let remoteAddDisposable = vscode.commands.registerCommand(
    "remoteTodo.addTodo",
    async () => {
      const userInfo = getGitUserInfo();
      if (!userInfo) {
        vscode.window.showErrorMessage("Git user information not available. Please configure git first.");
        return;
      }

      const message = await vscode.window.showInputBox({
        prompt: "Enter the remote TODO message",
        placeHolder: "e.g., Implement user authentication",
      });

      if (!message) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found.");
        return;
      }

      const lineNumber = editor.selection.active.line;
      const file = editor.document.uri.fsPath;
      const now = new Date().toISOString();

      const todo: Todo = {
        file,
        line: lineNumber,
        type: "remote",
        message,
        id: `remote-${file}:${lineNumber}:${Date.now()}`,
        author: userInfo,
        assignees: [userInfo],
        createdAt: now,
        updatedAt: now,
      };

      const existingTodos = await loadRemoteTodos(file);
      const updatedTodos = [...existingTodos, todo];
      await saveRemoteTodos(updatedTodos, file);

      // Clear cache for this file
      todoCache.clear();

      codeLensProvider.refresh();
      vscode.window.showInformationMessage(`Remote TODO "${message}" added.`);
    }
  );

  let remoteListDisposable = vscode.commands.registerCommand(
    "remoteTodo.listTodos",
    async () => {
      const userInfo = getGitUserInfo();
      if (!userInfo) {
        vscode.window.showErrorMessage("Git user information not available.");
        return;
      }

      const allRemoteTodos = await loadRemoteTodos();
      const visibleTodos = filterVisibleRemoteTodos(allRemoteTodos, userInfo.email);

      if (visibleTodos.length === 0) {
        vscode.window.showInformationMessage("No remote TODOs found for you.");
        return;
      }

      const items = visibleTodos.map((todo) => ({
        label: `${vscode.workspace.asRelativePath(todo.file)}:${todo.line + 1}`,
        description: `${todo.message} (${todo.author?.name})`,
        detail: `Assignees: ${todo.assignees?.map(a => a.name).join(', ') || 'None'}`,
        todo,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a remote TODO to view",
      });

      if (selected) {
        const uri = vscode.Uri.file(selected.todo.file);
        const position = new vscode.Position(selected.todo.line, 0);
        await vscode.window.showTextDocument(uri, {
          selection: new vscode.Range(position, position),
        });
      }
    }
  );

  let remoteAssignDisposable = vscode.commands.registerCommand(
    "remoteTodo.assignTodo",
    async (document: vscode.TextDocument, lineNumber: number, todo: Todo) => {
      const file = document.uri.fsPath;
      const allRemoteTodos = await loadRemoteTodos(file);
      const todoIndex = allRemoteTodos.findIndex(t => t.id === todo.id);

      if (todoIndex === -1) return;

      const currentTodo = allRemoteTodos[todoIndex];
      const currentAssignees = currentTodo.assignees || [];
      const teamMembers = await loadTeamMembers();

      // Create options for assignee management
      const assigneeOptions = currentAssignees.map((assignee) => ({
        label: `❌ Remove ${assignee.name}`,
        description: `${assignee.email}`,
        action: "remove",
        user: assignee
      }));

      const teamOptions = teamMembers
        .filter(member => !currentAssignees.some(a => a.email === member.email))
        .map((member) => ({
          label: `➕ Add ${member.name}`,
          description: `${member.email}`,
          action: "add_existing",
          user: member
        }));

      const options = [
        ...assigneeOptions,
        ...teamOptions,
        { label: "➕ Add New Team Member", description: "Add someone not in the team list", action: "add_new" },
        { label: "👥 Manage Team", description: "Add/remove team members globally", action: "manage_team" }
      ];

      const selectedOption = await vscode.window.showQuickPick(options, {
        placeHolder: "Choose assignee action",
        matchOnDescription: true
      });

      if (!selectedOption) return;

      if (selectedOption.action === "add_existing" && 'user' in selectedOption) {
        // Add existing team member
        currentAssignees.push(selectedOption.user);
        vscode.window.showInformationMessage(`✅ Added ${selectedOption.user.name} as assignee`);
      } else if (selectedOption.action === "add_new") {
        // Add new assignee with manual validation
        let assigneeEmail: string | undefined;
        let isValid = false;
        let validationAttempts = 0;

        while (!isValid && validationAttempts < 3) {
          assigneeEmail = await vscode.window.showInputBox({
            prompt: "Enter assignee email",
            placeHolder: "e.g., john.doe@example.com",
          });

          if (!assigneeEmail) {
            // User cancelled
            vscode.window.showWarningMessage("Assignee addition cancelled.");
            return;
          }

          // Manual validation with explicit error messages
          const trimmedEmail = assigneeEmail.trim();

          if (!trimmedEmail) {
            vscode.window.showErrorMessage("❌ Email is required. Please enter a valid email address.");
            validationAttempts++;
            continue;
          }

          if (!trimmedEmail.includes('@')) {
            vscode.window.showErrorMessage("❌ Please enter a valid email address (must contain @).");
            validationAttempts++;
            continue;
          }

          // Check if already assigned (case-insensitive)
          const normalizedEmail = trimmedEmail.toLowerCase();
          const isAlreadyAssigned = currentAssignees.some(a => a.email.toLowerCase().trim() === normalizedEmail);

          if (isAlreadyAssigned) {
            vscode.window.showErrorMessage("❌ This person is already assigned to this TODO.");
            validationAttempts++;
            continue;
          }

          // If we get here, validation passed
          isValid = true;
          assigneeEmail = trimmedEmail;
        }

        if (!isValid) {
          vscode.window.showWarningMessage("Assignee addition cancelled after 3 failed attempts.");
          return;
        }

        const assigneeName = await vscode.window.showInputBox({
          prompt: "Enter assignee name",
          placeHolder: "e.g., John Doe",
        });

        if (!assigneeName) return;

        const newAssignee: User = { name: assigneeName.trim(), email: assigneeEmail! };
        currentAssignees.push(newAssignee);

        // Optionally add to team
        const addToTeam = await vscode.window.showQuickPick(["Yes", "No"], {
          placeHolder: "Add this person to your team list for future use?"
        });

        if (addToTeam === "Yes") {
          await addTeamMember(assigneeName.trim(), assigneeEmail!);
          vscode.window.showInformationMessage(`✅ Added ${assigneeName.trim()} to team and as assignee`);
        } else {
          vscode.window.showInformationMessage(`✅ Added ${assigneeName.trim()} as assignee`);
        }
      } else if (selectedOption.action === "remove" && 'user' in selectedOption) {
        // Remove assignee
        const assigneeToRemove = selectedOption.user;
        const filteredAssignees = currentAssignees.filter(a => a.email !== assigneeToRemove.email);

        if (filteredAssignees.length === 0) {
          vscode.window.showWarningMessage("Cannot remove the last assignee. At least one assignee is required.");
          return;
        }

        allRemoteTodos[todoIndex].assignees = filteredAssignees;
        vscode.window.showInformationMessage(`❌ Removed ${assigneeToRemove.name} from assignees`);
      } else if (selectedOption.action === "manage_team") {
        // Open team management
        await vscode.commands.executeCommand("remoteTodo.manageTeam");
        return;
      }

      // Update the todo
      allRemoteTodos[todoIndex].updatedAt = new Date().toISOString();
      await saveRemoteTodos(allRemoteTodos, file);

      // Clear cache for this file
      todoCache.clear();

      codeLensProvider.refresh();
    }
  );

  let remoteRemoveDisposable = vscode.commands.registerCommand(
    "remoteTodo.removeTodo",
    async (document: vscode.TextDocument, lineNumber: number, todo: Todo) => {
      const file = document.uri.fsPath;
      const allRemoteTodos = await loadRemoteTodos(file);
      const updatedTodos = allRemoteTodos.filter(t => t.id !== todo.id);

      await saveRemoteTodos(updatedTodos, file);

      // Clear cache for this file
      todoCache.clear();

      codeLensProvider.refresh();

      vscode.window.showInformationMessage(`Remote TODO "${todo.message}" removed.`);
    }
  );

  let remoteEditDisposable = vscode.commands.registerCommand(
    "remoteTodo.editTodo",
    async (document: vscode.TextDocument, lineNumber: number, todo: Todo) => {
      const newMessage = await vscode.window.showInputBox({
        prompt: "Edit TODO message",
        value: todo.message,
      });

      if (!newMessage || newMessage === todo.message) return;

      const file = document.uri.fsPath;
      const allRemoteTodos = await loadRemoteTodos(file);
      const todoIndex = allRemoteTodos.findIndex(t => t.id === todo.id);

      if (todoIndex !== -1) {
        allRemoteTodos[todoIndex].message = newMessage;
        allRemoteTodos[todoIndex].updatedAt = new Date().toISOString();

        await saveRemoteTodos(allRemoteTodos, file);

        // Clear cache for this file
        todoCache.clear();

        codeLensProvider.refresh();

        vscode.window.showInformationMessage(`Remote TODO updated to "${newMessage}".`);
      }
    }
  );

  let remoteMoveDisposable = vscode.commands.registerCommand(
    "remoteTodo.moveTodo",
    async (document: vscode.TextDocument, lineNumber: number, todo: Todo) => {
      const input = await vscode.window.showInputBox({
        prompt: "Enter the line number to move this remote TODO on top of",
        placeHolder: "e.g., 15",
        validateInput: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num > document.lineCount) {
            return `Please enter a valid line number between 1 and ${document.lineCount}`;
          }
          return null;
        }
      });

      if (input) {
        const newLineNumber = parseInt(input) - 1;
        const file = document.uri.fsPath;
        const allRemoteTodos = await loadRemoteTodos(file);
        const todoIndex = allRemoteTodos.findIndex(t => t.id === todo.id);

        if (todoIndex !== -1) {
          allRemoteTodos[todoIndex].line = newLineNumber;
          allRemoteTodos[todoIndex].updatedAt = new Date().toISOString();

          await saveRemoteTodos(allRemoteTodos, file);

          // Clear cache for this file
          todoCache.clear();

          codeLensProvider.refresh();

          vscode.window.showInformationMessage(`Remote TODO moved to line ${newLineNumber + 1}`);
        }
      }
    }
  );

  let remoteManageTeamDisposable = vscode.commands.registerCommand(
    "remoteTodo.manageTeam",
    async () => {
      const teamMembers = await loadTeamMembers();

      const options = [
        { label: "➕ Add Team Member", description: "Add a new team member", action: "add" },
        ...teamMembers.map((member) => ({
          label: `❌ Remove ${member.name}`,
          description: `${member.email}`,
          action: "remove",
          member
        })),
        { label: "👀 View All Members", description: "List all current team members", action: "view" }
      ];

      const selectedOption = await vscode.window.showQuickPick(options, {
        placeHolder: "Choose team management action",
        matchOnDescription: true
      });

      if (!selectedOption) return;

      if (selectedOption.action === "add") {
        const memberEmail = await vscode.window.showInputBox({
          prompt: "Enter team member email",
          placeHolder: "e.g., john.doe@example.com",
          validateInput: (value) => {
            if (!value || value.trim() === '') return "Email is required";
            if (!value.includes('@')) return "Please enter a valid email address";
            // Check if already in team (case-insensitive)
            const normalizedEmail = value.toLowerCase().trim();
            if (teamMembers.some(m => m.email.toLowerCase().trim() === normalizedEmail)) {
              return "This person is already in the team";
            }
            return null;
          }
        });

        if (!memberEmail) return;

        const memberName = await vscode.window.showInputBox({
          prompt: "Enter team member name",
          placeHolder: "e.g., John Doe",
        });

        if (!memberName) return;

        const success = await addTeamMember(memberName, memberEmail);
        if (success) {
          vscode.window.showInformationMessage(`✅ Added ${memberName} to team`);
        }
      } else if (selectedOption.action === "remove" && 'member' in selectedOption) {
        const success = await removeTeamMember(selectedOption.member.email);
        if (success) {
          vscode.window.showInformationMessage(`❌ Removed ${selectedOption.member.name} from team`);
        }
      } else if (selectedOption.action === "view") {
        if (teamMembers.length === 0) {
          vscode.window.showInformationMessage("No team members found. Add some team members first.");
          return;
        }

        const memberList = teamMembers.map((member, index) =>
          `${index + 1}. ${member.name} (${member.email})`
        ).join('\n');

        vscode.window.showInformationMessage(`Team Members:\n${memberList}`, { modal: true });
      }
    }
  );

  context.subscriptions.push(
    disposable,
    listDisposable,
    listAllTodosDisposable,
    removeDisposable,
    editDisposable,
    editTodosInFileDisposable,
    editTodosInLineDisposable,
    moveTodoDisposable,
    remoteConvertDisposable,
    remoteAddDisposable,
    remoteListDisposable,
    remoteAssignDisposable,
    remoteRemoveDisposable,
    remoteEditDisposable,
    remoteMoveDisposable,
    remoteManageTeamDisposable
  );

  // Refresh decorations and diagnostics on document open and change
  vscode.workspace.onDidOpenTextDocument(
    (document) => {
      debouncedRefreshDecorations();
      updateDiagnostics();
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      // Only refresh for the active editor to avoid unnecessary updates
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document === event.document) {
        debouncedRefreshDecorations();
      }
    },
    null,
    context.subscriptions
  );

  // Initial refresh
  debouncedRefreshDecorations();
  updateDiagnostics();
}

function debouncedRefreshDecorations() {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
  refreshTimeout = setTimeout(refreshDecorations, 300);
}

async function updateDiagnostics() {
  // Clear existing diagnostics
  diagnosticCollection.clear();

  // Get all open text editors
  const editors = vscode.window.visibleTextEditors;

  for (const editor of editors) {
    const todos = await loadTodos(editor.document.uri.fsPath);
    const fileTodos = todos.filter(todo => todo.file === editor.document.uri.fsPath);

    const diagnostics: vscode.Diagnostic[] = [];

    for (const todo of fileTodos) {
      if (todo.line < editor.document.lineCount) {
        const line = editor.document.lineAt(todo.line);
        const range = new vscode.Range(todo.line, 0, todo.line, line.text.length);

        // Create information-level diagnostic for TODO
        const diagnostic = new vscode.Diagnostic(
          range,
          `TODO: ${todo.message}`,
          vscode.DiagnosticSeverity.Information
        );

        // Add custom tags and source
        diagnostic.source = 'Local TODO';
        diagnostic.code = {
          value: `todo-${todo.id}`,
          target: vscode.Uri.parse(`command:localTodo.editTodo?${encodeURIComponent(JSON.stringify([editor.document, todo.line, todo]))}`)
        };

        diagnostics.push(diagnostic);
      }
    }

    // Set diagnostics for this file
    diagnosticCollection.set(editor.document.uri, diagnostics);
  }
}



// Auto-manage .gitignore entries for local files
async function ensureGitIgnoreEntries() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const gitignorePath = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
  let gitignoreContent = '';

  try {
    // Try to read existing .gitignore
    const gitignoreDocument = await vscode.workspace.openTextDocument(gitignorePath);
    gitignoreContent = gitignoreDocument.getText();
  } catch (error) {
    // .gitignore doesn't exist, create it
    gitignoreContent = '';
  }

  const lines = gitignoreContent.split('\n').map(line => line.trim());
  let needsUpdate = false;

  // Check if .localtodos.json is already in .gitignore
  if (!lines.some(line => line === '.localtodos.json' || line === '*.localtodos.json')) {
    lines.push('.localtodos.json');
    needsUpdate = true;
  }

  // Check if .awesometeam.json is already in .gitignore
  if (!lines.some(line => line === '.awesometeam.json' || line === '*.awesometeam.json')) {
    lines.push('.awesometeam.json');
    needsUpdate = true;
  }

  // Update .gitignore if needed
  if (needsUpdate) {
    const updatedContent = lines.filter(line => line.length > 0).join('\n') + '\n';

    try {
      await vscode.workspace.fs.writeFile(gitignorePath, Buffer.from(updatedContent, 'utf8'));
      console.log('Updated .gitignore with local TODO file entries');
    } catch (error) {
      console.error('Failed to update .gitignore:', error);
    }
  }
}

// Removed text decorations completely - using only CodeLens, Hover, and Diagnostics
async function refreshDecorations() {
  // Clear all text decorations
  const editors = vscode.window.visibleTextEditors;
  for (const editor of editors) {
    editor.setDecorations(decorationType, []);
  }
}

export function deactivate() {
  if (decorationType) {
    decorationType.dispose();
  }
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
}
