import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BirthDateInput } from './BirthDateInput';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));

describe('BirthDateInput on mobile', () => {
  function ControlledBirthDateInput({ initialValue = '' }: { initialValue?: string }) {
    const [value, setValue] = useState(initialValue);
    return <BirthDateInput aria-label="Date of birth" value={value} onValueChange={setValue} />;
  }

  it('accepts numeric typing and emits an ISO date', () => {
    const onValueChange = vi.fn();
    render(<BirthDateInput aria-label="Date of birth" value="" onValueChange={onValueChange} />);

    const input = screen.getByRole('textbox', { name: 'Date of birth' });
    fireEvent.change(input, { target: { value: '12032010' } });

    expect(input).toHaveValue('12/03/2010');
    expect(onValueChange).toHaveBeenLastCalledWith('2010-03-12');
    expect(input).toBeValid();
  });

  it('rejects impossible dates without retaining a stale value', () => {
    const onValueChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <BirthDateInput
        aria-label="Date of birth"
        value=""
        onValueChange={onValueChange}
        onValidityChange={onValidityChange}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Date of birth' });
    fireEvent.change(input, { target: { value: '31022010' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeInvalid();
    expect(onValueChange).toHaveBeenLastCalledWith('');
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  it('lets an existing date be explicitly cleared', () => {
    const onValueChange = vi.fn();
    render(<BirthDateInput aria-label="Date of birth" value="2010-03-12" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear date of birth' }));

    expect(screen.getByRole('textbox', { name: 'Date of birth' })).toHaveValue('');
    expect(onValueChange).toHaveBeenLastCalledWith('');
  });

  it('keeps a partial typed draft when replacing an existing date', () => {
    render(<ControlledBirthDateInput initialValue="2010-03-12" />);

    const input = screen.getByRole('textbox', { name: 'Date of birth' });
    fireEvent.change(input, { target: { value: '2' } });

    expect(input).toHaveValue('2');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
