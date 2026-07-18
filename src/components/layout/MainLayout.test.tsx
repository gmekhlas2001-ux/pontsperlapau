import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MainLayout } from './MainLayout';

vi.mock('./Sidebar', () => ({
  Sidebar: () => null,
  MobileBottomNav: () => null,
}));

vi.mock('./Header', () => ({
  Header: () => null,
}));

describe('MainLayout', () => {
  it('returns the shell scroll container to the top after route navigation', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/first']}>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route path="first" element={<Link to="/second">Open second page</Link>} />
            <Route path="second" element={<p>Second page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const main = document.querySelector('#main-content');
    expect(main).toBeInstanceOf(HTMLElement);
    if (!(main instanceof HTMLElement)) return;

    main.scrollTop = 420;
    await user.click(screen.getByRole('link', { name: 'Open second page' }));

    await waitFor(() => {
      expect(screen.getByText('Second page')).toBeInTheDocument();
      expect(main.scrollTop).toBe(0);
    });
  });
});
