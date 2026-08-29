# Frontend Testing Guidelines

This document outlines the testing infrastructure and best practices for the Stellar Bridge Watch frontend.

> **Fixture inventory:** Shared test data (MSW handlers, type factories, and E2E mocks) is catalogued in [FIXTURE_AUDIT_REPORT.md](../../docs/FIXTURE_AUDIT_REPORT.md). Prefer `src/test/factories.ts` builders over inline mock arrays when adding new tests.

## Testing Stack

- **Testing Framework**: [Vitest](https://vitest.dev/)
- **Component Testing**: [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- **API Mocking**: [Mock Service Worker (MSW)](https://mswjs.io/)
- **Accessibility**: [vitest-axe](https://github.com/capricorn86/vitest-axe)
- **Coverage**: [Vitest Coverage (v8)](https://vitest.dev/guide/coverage.html)

## Running Tests

### Development Mode
Runs tests in watch mode:
```bash
npm run test:watch -w frontend
```

### Coverage Report
Generates a coverage report in the `coverage/` directory:
```bash
npm run test:coverage -w frontend
```

### UI Mode
Opens the Vitest UI in the browser:
```bash
npm run test:ui -w frontend
```

## Writing Tests

### Custom Render
Always use the custom `render` from `src/test/utils.tsx`. It includes necessary providers like `QueryClientProvider` and `MemoryRouter`.

```tsx
import { render, screen } from '../test/utils';
import MyComponent from './MyComponent';

test('renders component', () => {
  render(<MyComponent />);
  expect(screen.getByText(/hello/i)).toBeInTheDocument();
});
```

### API Mocking
Mocks are handled globally in `src/test/mocks/handlers.ts`. If you need to override a handler for a specific test:

```tsx
import { server } from '../test/mocks/server';
import { http, HttpResponse } from 'msw';

test('handles error state', async () => {
  server.use(
    http.get('/api/v1/assets', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );
  // ... test logic
});
```

### Accessibility Testing
Use `toHaveNoViolations()` from `vitest-axe`:

```tsx
import { render, axe } from '../test/utils';

test('should have no accessibility violations', async () => {
  const { container } = render(<MyComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Coverage Thresholds
The project maintains a **legacy threshold of 80%** for:
- Lines
- Functions
- Branches
- Statements

CI will fail if coverage drops below these levels.
