# Awesome-TODO

A powerful VS Code extension that revolutionizes your TODO workflow with both personal and team collaboration features. Manage local TODOs for personal tasks and remote TODOs for team-shared work with seamless git integration.

## ✨ Features

### Local TODOs (Personal)
- **Inline TODO Display**: TODOs appear directly in your code with proper indentation matching
- **Interactive Editing**: Click on TODOs or use keyboard shortcuts to edit them inline
- **Smart Indentation**: TODOs automatically match the indentation of the following code line
- **Real-time Updates**: Changes appear immediately without needing to reload files
- **Clean UI**: Orange-colored decorations with hover tooltips for guidance

### Remote TODOs (Team Collaboration)
- **Team Sharing**: Remote TODOs stored in git-tracked `.remotetodos.json` file
- **Smart Visibility**: Only see TODOs you're assigned to or authored
- **Multiple Assignees**: Assign TODOs to multiple team members
- **Git Integration**: Automatic user identification via git config
- **Collaborative Workflow**: Perfect for agile development teams

### General Features
- **Language Support**: Works with JavaScript, TypeScript, Python, and other languages
- **Dual Mode**: Choose between local (personal) and remote (team) TODOs
- **Rich UI**: Visual distinction between local (📝) and remote (🌐) TODOs
- **CodeLens Integration**: Inline action buttons for all TODO operations

## 🚀 Installation

### Option 1: From VSIX File
1. Download the `Awesome-todo-extension-0.0.1.vsix` file
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Type "Extensions: Install from VSIX..."
5. Select the downloaded `.vsix` file

### Option 2: From Source
1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Run `npx vsce package`
5. Install the generated `.vsix` file as above

## 📖 Usage

### Git Setup (Required for Remote TODOs)

Before using remote TODOs, configure your git user information:
```bash
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### Creating Local TODOs

1. **Write a TODO comment** in your code:
   ```javascript
   // TODO: implement user authentication
   function login() {
       // code here
   }
   ```

2. **Place cursor on the TODO line**
3. **Press `Ctrl+.`** (or `Cmd+.` on Mac) to open Quick Fix
4. **Select "Convert to Local TODO"**

### Creating Remote TODOs

1. **Write a TODO comment** in your code:
   ```javascript
   // TODO: implement user authentication system
   function login() {
       // code here
   }
   ```

2. **Place cursor on the TODO line**
3. **Press `Ctrl+.`** to open Quick Fix
4. **Select "Convert to Remote TODO"**

Or create remote TODOs directly:
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Add Remote TODO"
3. Enter your TODO message

### Viewing TODOs

**Local TODOs** appear with 📝 icon:
```javascript
function login() {
    console.log("Login function"); 📝 <TODO: implement user authentication>
    // Your code continues here...
}
```

**Remote TODOs** appear with 🌐 icon and show author/assignee info:
```javascript
function login() {
    console.log("Login function"); 🌐 <TODO: implement user auth system>
    // By: John Doe, Assigned: Jane Smith, Bob Wilson
}
```

### Managing Remote TODOs

**Assign Team Members:**
1. Hover over a remote TODO
2. Click the "👤 Assign" button
3. Choose from:
   - **Existing team members** (quick selection)
   - **Add new team member** (with option to save to team)
   - **Manage team globally** (add/remove team members)

**Edit Remote TODOs:**
1. Hover over a remote TODO
2. Click the "✏️ Edit" button
3. Modify the message

**List All Remote TODOs:**
- Press `Ctrl+Shift+P`
- Type "List Remote TODOs"
- Select from your visible remote TODOs

**Manage Team Members:**
- Press `Ctrl+Shift+P`
- Type "Manage Team Members"
- Add/remove team members globally
- View all current team members

### Example Workflow

**Before:**
```python
def process_data():
    # TODO: validate input data and handle errors
    data = load_data()
    return process(data)
```

**After converting to Remote TODO:**
```python
def process_data():
    data = load_data()    🌐 <TODO: validate input data and handle errors>
    return process(data)
    # By: John Doe, Assigned: Jane Smith
```

**After editing:**
```python
def process_data():
    # TODO: validate input data and handle errors with proper logging
    data = load_data()
    if not data:
        logger.error("No data provided")
        raise ValueError("No data provided")
    return process(data)
```

### Team Collaboration

- **Visibility**: You only see remote TODOs you're assigned to or authored
- **Git Tracking**: Remote TODOs are stored in `.remotetodos.json` and can be committed
- **Multiple Assignees**: Assign TODOs to multiple team members
- **Real-time Sync**: Changes are reflected immediately for all team members

## 🎨 Visual Design

- **Color**: Orange (`#FFA500`) with subtle background highlighting
- **Position**: Inline after code content
- **Hover**: Shows TODO message and editing instructions

## 🔧 Technical Details

### Supported Languages
- JavaScript (`.js`)
- TypeScript (`.ts`)
- Python (`.py`)
- Any language with `//` or `#` comment syntax

### File Storage

**Local TODOs:**
- Stored in `.localtodos.json` in your workspace root
- Personal TODOs visible only to you
- Contains: file path, line number, message, and metadata

**Remote TODOs:**
- Stored in `.remotetodos.json` in your workspace root
- Git-tracked file for team collaboration
- Contains: file path, line number, message, author, assignees, timestamps
- Smart filtering: only shows TODOs you're assigned to or authored

### Git Integration
- **User Identification**: Uses `git config user.name` and `user.email`
- **Team Collaboration**: Remote TODOs are version-controlled
- **Visibility Control**: Automatic filtering based on git user identity

### Comment Prefixes
- **Python**: `# TODO: message`
- **JavaScript/TypeScript**: `// TODO: message`

### Keyboard Shortcuts
- `Ctrl+.` (Windows/Linux) or `Cmd+.` (Mac): Open Quick Fix menu for TODO actions
- `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac): Access command palette for all TODO operations

### Commands Available
- `Local TODO: Convert Todo` - Convert comment to local TODO
- `Local TODO: List Todos` - View all local TODOs
- `Local TODO: Edit Todo` - Edit local TODO inline
- `Local TODO: Move Todo` - Move local TODO to different line
- `Local TODO: Remove Todo` - Delete local TODO
- `Remote TODO: Convert Todo` - Convert comment to remote TODO
- `Remote TODO: Add Todo` - Create new remote TODO
- `Remote TODO: List Todos` - View your remote TODOs
- `Remote TODO: Edit Todo` - Edit remote TODO
- `Remote TODO: Assign Todo` - Add assignees to remote TODO
- `Remote TODO: Move Todo` - Move remote TODO to different line
- `Remote TODO: Remove Todo` - Delete remote TODO

## 🐛 Known Issues & Limitations

- Decorations may not appear immediately in some cases, fixes:
- Format document or make some changes to refresh
- Reopen files
- Refresh with "Developer: Reload Window"
- Multiple TODOs on the same line are supported but displayed as separate decorations
- Large files with many TODOs may impact performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

Built with ❤️ using the VS Code Extension API.
