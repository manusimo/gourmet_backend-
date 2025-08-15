# Testing Documentation

This directory contains comprehensive tests for the Gourmet Backend API, covering both helper functions and route handlers.

## 📁 Test Structure

```
src/tests/
├── helpers/           # Unit tests for helper functions
│   ├── poolHelpers.test.js
│   └── jobHelpers.test.js
├── routes/            # Integration tests for route handlers
│   ├── pool.route.test.js
│   └── job.route.test.js
├── setup.js           # Test configuration and utilities
└── README.md          # This file
```

## 🚀 Running Tests

### Install Dependencies
```bash
npm install --save-dev jest supertest @jest/globals
```

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Run Specific Test Files
```bash
# Run only helper tests
npm test -- helpers/

# Run only route tests
npm test -- routes/

# Run specific test file
npm test -- poolHelpers.test.js
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

## 📋 Test Categories

### 1. Helper Function Tests (`helpers/`)

Unit tests for business logic functions that handle database operations and data processing.

#### `poolHelpers.test.js`
- **Purpose**: Test talent pool management functions
- **Coverage**: 
  - `checkTalentPoolEntry()` - Check if talent exists
  - `createTalentPoolEntry()` - Create new talent pool entry
  - `buildTalentPoolFilters()` - Build search filters
  - `getTalentPoolEntryWithConversations()` - Get entry with conversations
  - `deleteTalentPoolEntry()` - Delete entry and associated data
  - `approveTalentPoolEntry()` - Approve talent pool entry

#### `jobHelpers.test.js`
- **Purpose**: Test job offer management functions
- **Coverage**:
  - `createJobOffer()` - Create new job offer
  - `getJobOfferWithLocation()` - Get job with location
  - `generateJobPlanInfo()` - Generate plan information
  - `getEmployeeById()` - Get employee by ID
  - `getEmployeeApplications()` - Get employee applications
  - `getJobsWithFilters()` - Get jobs with filters
  - `getTotalJobsCount()` - Count total jobs
  - `getRestaurantJobOffers()` - Get restaurant job offers
  - `getJobOfferById()` - Get job offer by ID
  - `getRestaurantUserWithDetails()` - Get restaurant user details
  - `getRestaurantWithLocations()` - Get restaurant with locations
  - `generateCompletePlanInfo()` - Generate complete plan info

### 2. Route Handler Tests (`routes/`)

Integration tests for HTTP endpoints that test the complete request-response cycle.

#### `pool.route.test.js`
- **Purpose**: Test talent pool API endpoints
- **Coverage**:
  - `GET /talent-pool/check` - Check if talent exists
  - `POST /talent-pool` - Add employee to talent pool
  - `GET /talent-pool` - Get talent pool with filters
  - `DELETE /talent-pool/:talentId` - Remove talent from pool
  - `PATCH /talent-pool/:id/approve` - Approve talent pool entry

#### `job.route.test.js`
- **Purpose**: Test job offer API endpoints
- **Coverage**:
  - `POST /job` - Create job offer
  - `GET /jobs/recommended-jobs` - Get recommended jobs
  - `GET /jobs/top-rated-jobs-carousel` - Get top rated jobs
  - `PATCH /job/:id` - Update job offer
  - `GET /jobs/applied` - Get employee applications
  - `GET /jobs` - Get jobs with filters and pagination
  - `GET /jobs/restaurant` - Get restaurant job offers
  - `GET /jobs/:jobId` - Get job offer by ID
  - `DELETE /job/:id` - Delete job offer
  - `GET /my-plan-info` - Get plan info and job offers

## 🧪 Test Features

### Mocking Strategy
- **Prisma Client**: Mocked to avoid database connections during tests
- **External Dependencies**: All external services are mocked
- **Middleware**: Authentication and authorization middleware are mocked
- **Environment Variables**: Test-specific environment variables are set

### Test Utilities
- **Mock Request/Response**: Helper functions to create mock Express objects
- **Test Data Factories**: Functions to create consistent test data
- **Global Setup**: Test configuration and utilities in `setup.js`

### Coverage Areas
- ✅ **Happy Path**: Successful operations
- ✅ **Error Handling**: Database errors, validation errors
- ✅ **Edge Cases**: Null values, invalid inputs
- ✅ **Authentication**: Protected route access
- ✅ **Authorization**: Role-based access control
- ✅ **Input Validation**: Request body and query parameter validation
- ✅ **Response Format**: Consistent API response structure

## 📊 Test Metrics

### Coverage Goals
- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 95%
- **Lines**: > 90%

### Performance Targets
- **Unit Tests**: < 100ms per test
- **Integration Tests**: < 500ms per test
- **Full Test Suite**: < 30 seconds

## 🔧 Test Configuration

### Jest Configuration (`jest.config.js`)
- **Test Environment**: Node.js
- **ESM Support**: Configured for ES modules
- **Coverage**: HTML, LCOV, and text reports
- **Timeout**: 10 seconds per test
- **Mock Clearing**: Automatic mock cleanup between tests

### Test Setup (`setup.js`)
- **Environment Variables**: Test-specific configuration
- **Global Utilities**: Mock request/response helpers
- **Test Data Factories**: Consistent test data creation
- **Prisma Mock**: Complete Prisma client mock

## 🚨 Common Test Patterns

### Helper Function Testing
```javascript
describe('functionName', () => {
  it('should handle successful case', async () => {
    // Arrange
    const mockData = createTestData();
    mockPrisma.table.method.mockResolvedValue(mockData);
    
    // Act
    const result = await functionName(params);
    
    // Assert
    expect(result).toEqual(expectedResult);
    expect(mockPrisma.table.method).toHaveBeenCalledWith(expectedParams);
  });
});
```

### Route Testing
```javascript
describe('GET /endpoint', () => {
  it('should return data successfully', async () => {
    // Arrange
    const mockData = createTestData();
    mockHelper.getData.mockResolvedValue(mockData);
    
    // Act
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);
    
    // Assert
    expect(response.body).toEqual({
      success: true,
      data: mockData
    });
  });
});
```

## 🐛 Debugging Tests

### Running Single Tests
```bash
# Run specific test
npm test -- --testNamePattern="should create job offer"

# Run tests in specific file
npm test -- poolHelpers.test.js
```

### Debug Mode
```bash
# Run tests with Node.js debugger
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Verbose Output
```bash
# Run tests with detailed output
npm test -- --verbose
```

## 📝 Adding New Tests

### For Helper Functions
1. Create test file in `helpers/` directory
2. Import the helper functions to test
3. Mock Prisma client methods
4. Test all scenarios: success, error, edge cases
5. Verify function calls and return values

### For Route Handlers
1. Create test file in `routes/` directory
2. Mock all dependencies (helpers, middleware, etc.)
3. Test HTTP requests with supertest
4. Verify response status codes and body
5. Test authentication and authorization

### Test Naming Convention
- **Helper Tests**: `functionName.test.js`
- **Route Tests**: `routeName.route.test.js`
- **Test Descriptions**: Use descriptive names that explain the scenario

## 🔄 Continuous Integration

### GitHub Actions
Tests are automatically run on:
- **Push to main**: Full test suite
- **Pull Requests**: Full test suite with coverage
- **Scheduled**: Daily test runs

### Pre-commit Hooks
- **Linting**: ESLint checks
- **Testing**: Unit tests
- **Coverage**: Minimum coverage thresholds

## 📈 Monitoring Test Quality

### Coverage Reports
- **HTML**: `coverage/index.html`
- **LCOV**: `coverage/lcov.info`
- **Console**: Summary in terminal output

### Test Metrics
- **Execution Time**: Track test performance
- **Coverage Trends**: Monitor coverage over time
- **Flaky Tests**: Identify and fix unstable tests

## 🎯 Best Practices

1. **Isolation**: Each test should be independent
2. **Descriptive Names**: Use clear test descriptions
3. **Arrange-Act-Assert**: Follow AAA pattern
4. **Mock External Dependencies**: Don't rely on external services
5. **Test Edge Cases**: Include error scenarios
6. **Consistent Data**: Use test data factories
7. **Fast Execution**: Keep tests fast and focused
8. **Maintainable**: Write tests that are easy to understand and modify

## 🤝 Contributing to Tests

When adding new features or fixing bugs:

1. **Write Tests First**: Follow TDD when possible
2. **Update Existing Tests**: Modify tests when changing functionality
3. **Maintain Coverage**: Keep coverage above thresholds
4. **Document Changes**: Update this README when adding new test files
5. **Review Test Quality**: Ensure tests are meaningful and maintainable 