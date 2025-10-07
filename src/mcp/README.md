# MCP (Model Context Protocol) Setup

This directory contains the MCP server and client implementation for the Gourmet platform, enabling AI agents to communicate with backend tools through a standardized protocol.

## Architecture

```
Frontend Chat → Backend API → MCP Client → MCP Server → MCP Tools → Database
```

## Files

- `server.js` - MCP Server implementation
- `standaloneClient.js` - MCP Client that connects to the server
- `startMCP.js` - Startup script for the MCP server
- `config.js` - MCP configuration
- `tools/` - Directory containing all MCP tools

## How It Works

1. **MCP Server**: Runs as a separate process, exposing tools via the MCP protocol
2. **MCP Client**: Connects to the server and provides a clean interface for the backend
3. **Tools**: Individual functions that can be called by AI agents through MCP

## Usage

### Start the MCP Server
```bash
npm run mcp-server
```

### Start Backend with MCP
```bash
npm run dev:mcp
```

### Environment Variables
- `MCP_CLIENT_ENABLED=true` - Enable MCP client
- `MCP_DEBUG=true` - Enable debug logging

## Adding New Agents

To add new agents that can use MCP:

1. Create new tools in the `tools/` directory
2. Register them in `tools/index.js`
3. The MCP server will automatically expose them to agents
4. Agents can call tools using the MCP protocol

## Benefits

- **Scalable**: Easy to add new agents and tools
- **Standardized**: Uses the MCP protocol for consistent communication
- **Isolated**: MCP server runs separately, preventing crashes from affecting the main backend
- **Extensible**: New tools can be added without changing existing code

## Testing

Test the MCP connection:
```bash
curl http://localhost:3000/api/ai-job-creation/health
```

This will show the MCP server status and health.