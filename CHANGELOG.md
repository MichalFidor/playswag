# Changelog

## 0.2.0 (2025-07-16)

### 🚀 Major Features

- **Global Request Tracking**: Implement singleton-based global request tracking across all PlaySwag instances
  - Track API requests across multiple test files and instances
  - Generate comprehensive test suite coverage reports
  - Support for both local and global data analysis
  - Backward compatible with existing code

### ✨ New Features

- `getGlobalRequests()` - Access requests from all PlaySwag instances
- `clearGlobalRequests()` - Clear global request store
- `generateReport(useGlobalData)` - Generate reports with global or local data
- `printReport(useGlobalData)` - Print reports with global or local data  
- `setGlobalTracking(enabled)` - Enable/disable global tracking per instance
- `isGlobalTrackingEnabled()` - Check global tracking status
- `generateGlobalComprehensiveSummary()` - Convenience method for global comprehensive reports
- Enhanced export methods with `useGlobalData` parameter

### 📚 Documentation

- Comprehensive `GLOBAL_TRACKING.md` documentation
- Updated README with global tracking examples
- Example test file demonstrating global tracking features
- Important notes about test worker configuration for global tracking

### 🔧 Technical Changes

- New `GlobalRequestStore` singleton class for cross-instance data sharing
- Enhanced `RequestTracker` constructor with optional `useGlobalTracking` parameter
- Updated `CoverageAnalyzer.analyze()` to support global data
- All export and reporting methods now support global data option
- Maintains full backward compatibility - existing code unchanged

### ⚠️ Important Notes

- Global tracking requires single worker execution (`--workers=1`) due to Playwright's multi-process architecture
- Global tracking is **enabled by default** for new instances
- All existing APIs work unchanged (local tracking preserved)

## 0.1.0 (2023-XX-XX)

### Features

- Initial release
- OpenAPI/Swagger specification parsing
- Request tracking for Playwright API tests
- Coverage analysis and reporting
- Support for exporting results in multiple formats (JSON, CSV, JUnit XML)
- Examples and documentation
