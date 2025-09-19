import * as vscode from 'vscode';
import { loadTodos, loadRemoteTodos, filterVisibleRemoteTodos, getGitUserInfo, Todo } from './utils';

export class TodoCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[] | undefined> {
    const line = document.lineAt(range.start.line);
    const text = line.text.trim();
    const actions: vscode.CodeAction[] = [];

    // Detect //TODO or #TODO in comments (with optional : or -)
    if (/^((\/\/)|#)\s*TODO[:\-]?\s*/i.test(text)) {
      const localAction = new vscode.CodeAction(
        'Convert to Local TODO',
        vscode.CodeActionKind.QuickFix
      );

      localAction.command = {
        command: 'localTodo.convertTodo',
        title: 'Convert to Local TODO',
        arguments: [document, line.lineNumber, text]
      };

      const remoteAction = new vscode.CodeAction(
        'Convert to Remote TODO',
        vscode.CodeActionKind.QuickFix
      );

      remoteAction.command = {
        command: 'remoteTodo.convertTodo',
        title: 'Convert to Remote TODO',
        arguments: [document, line.lineNumber, text]
      };

      actions.push(localAction, remoteAction);
    }

    // Check if this file has any stored local todos for editing
    const localTodos = await loadTodos(document.uri.fsPath);
    const fileLocalTodos = localTodos.filter(todo => todo.file === document.uri.fsPath);

    if (fileLocalTodos.length > 0) {
      // Check if this specific line has any local todos
      const lineLocalTodos = fileLocalTodos.filter(todo => todo.line === line.lineNumber);

      if (lineLocalTodos.length > 0) {
        if (lineLocalTodos.length === 1) {
          // Single local todo on this line
          const editAction = new vscode.CodeAction(
            'Edit Local TODO',
            vscode.CodeActionKind.QuickFix
          );

          editAction.command = {
            command: 'localTodo.editTodo',
            title: 'Edit Local TODO',
            arguments: [document, line.lineNumber, lineLocalTodos[0]]
          };

          actions.push(editAction);
        } else {
          // Multiple local todos on this line - show selection
          const editAction = new vscode.CodeAction(
            `Edit Local TODOs (${lineLocalTodos.length})`,
            vscode.CodeActionKind.QuickFix
          );

          editAction.command = {
            command: 'localTodo.editTodosInLine',
            title: 'Edit Local TODOs',
            arguments: [document, line.lineNumber, lineLocalTodos]
          };

          actions.push(editAction);
        }
      } else {
        // Show general edit action for the file
        const editAction = new vscode.CodeAction(
          'Edit Local TODOs',
          vscode.CodeActionKind.QuickFix
        );

        editAction.command = {
          command: 'localTodo.editTodosInFile',
          title: 'Edit Local TODOs',
          arguments: [document]
        };

        actions.push(editAction);
      }
    }

    // Check if this file has any stored remote todos for editing (filtered by user visibility)
    const userInfo = getGitUserInfo();
    if (userInfo) {
      const allRemoteTodos = await loadRemoteTodos(document.uri.fsPath);
      const visibleRemoteTodos = filterVisibleRemoteTodos(allRemoteTodos, userInfo.email).filter(todo => todo.file === document.uri.fsPath);

      if (visibleRemoteTodos.length > 0) {
        // Check if this specific line has any remote todos
        const lineRemoteTodos = visibleRemoteTodos.filter(todo => todo.line === line.lineNumber);

        if (lineRemoteTodos.length > 0) {
          if (lineRemoteTodos.length === 1) {
            // Single remote todo on this line
            const editAction = new vscode.CodeAction(
              'Edit Remote TODO',
              vscode.CodeActionKind.QuickFix
            );

            editAction.command = {
              command: 'remoteTodo.editTodo',
              title: 'Edit Remote TODO',
              arguments: [document, line.lineNumber, lineRemoteTodos[0]]
            };

            const assignAction = new vscode.CodeAction(
              'Assign Remote TODO',
              vscode.CodeActionKind.QuickFix
            );

            assignAction.command = {
              command: 'remoteTodo.assignTodo',
              title: 'Assign Remote TODO',
              arguments: [document, line.lineNumber, lineRemoteTodos[0]]
            };

            actions.push(editAction, assignAction);
          } else {
            // Multiple remote todos on this line - show selection (simplified for now)
            const editAction = new vscode.CodeAction(
              `Edit Remote TODOs (${lineRemoteTodos.length})`,
              vscode.CodeActionKind.QuickFix
            );

            editAction.command = {
              command: 'remoteTodo.listTodos',
              title: 'List Remote TODOs',
              arguments: []
            };

            actions.push(editAction);
          }
        } else {
          // Show general remote todo action
          const listAction = new vscode.CodeAction(
            'List Remote TODOs',
            vscode.CodeActionKind.QuickFix
          );

          listAction.command = {
            command: 'remoteTodo.listTodos',
            title: 'List Remote TODOs',
            arguments: []
          };

          actions.push(listAction);
        }
      }
    }

    return actions.length > 0 ? actions : undefined;
  }
}
