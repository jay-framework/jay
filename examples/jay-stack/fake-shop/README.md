# Jay Stack Fake Shop Example

This example demonstrates how to use the Jay Stack CLI with custom configuration for both the dev server and the editor server.

## Configuration

The `.jay` file in this directory configures the port ranges for both servers (YAML format):

```yaml
devServer:
  portRange: [3000, 3010]
  pagesBase: './src/pages'  # Directory containing your Jay pages
  publicFolder: './public'  # Directory for static files (CSS, JS, images, etc.)
editorServer:
  portRange: [3011, 3020]
  # editorId will be automatically set when an editor connects
```

## Usage

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev and editor servers:
   ```bash
   npm run dev
   ```

The CLI will automatically find available ports within the specified ranges and start both servers. You should see output like:

```
🚀 Jay Stack CLI started successfully!
📱 Dev Server: http://localhost:3000
🎨 Editor Server: http://localhost:3011 (ID: init)
📁 Pages directory: ./src/pages
📁 Public folder: ./public
```

You can now develop and edit your Jay app using these servers. Static files in the `public` folder will be served automatically.
