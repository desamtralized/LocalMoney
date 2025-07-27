## FEATURE:

- Flutter mobile application (iOS/Android) for remotely managing Claude Code instances running on VPS servers
- Secure SSH-based connection management with encrypted credential storage  
- Real-time session monitoring and control (start/stop/resume Claude Code sessions)
- Mobile-optimized chat interface for interacting with Claude Code instances
- Remote file browser and basic file management capabilities
- Connection status monitoring and system health checks
- MVP focused on core connection management and basic Claude Code interaction

## EXAMPLES:

Ignore it.

## DOCUMENTATION:

Flutter documentation: https://docs.flutter.dev/
Claude Code documentation: https://docs.anthropic.com/en/docs/claude-code
Claudia (Desktop GUI for Claude Code): https://github.com/getAsterisk/claudia
SSH client libraries for Flutter/Dart
Flutter secure storage: https://pub.dev/packages/flutter_secure_storage
WebSocket/real-time communication patterns in Flutter
Mobile UI/UX best practices for developer tools

## OTHER CONSIDERATIONS:

- **Security First**: All VPS credentials must use device keychain/keystore, never store SSH keys in plain text
- **Mobile Network Reliability**: Implement robust connection retry mechanisms for unstable mobile networks
- **Battery Optimization**: Minimize background processes and use efficient polling strategies
- **Cross-Platform Considerations**: Ensure SSH connectivity works consistently on both iOS and Android
- **MVP Scope Discipline**: Stick to basic connection management and chat interface - resist feature creep
- **Error Handling**: Mobile users expect graceful degradation when network conditions are poor
- **App Store Compliance**: Consider iOS/Android security requirements for SSH client applications
- **Offline Capability**: Cache connection configs and session history for offline viewing
- **Resource Constraints**: Target <50MB app size, <100MB RAM usage during operation

## RELATED PROJECTS:

- **Claudia**: Desktop GUI toolkit for Claude Code with advanced features like custom AI agents, session management, usage analytics, and visual timelines. While desktop-focused, it demonstrates sophisticated approaches to Claude Code interaction that could inspire mobile implementations. https://github.com/getAsterisk/claudia
