import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/ui/api/client';
import { Composer } from '@/ui/features/feed/Composer';
import { theme } from '@/ui/theme/theme';

// The post composer (CNT-1): counter, inline validation, progress, and typed text kept on failure.

function renderComposer(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ThemeProvider theme={theme}>
      <Composer label="Write a post" submitLabel="Post" onSubmit={onSubmit} />
    </ThemeProvider>,
  );
  return {
    onSubmit,
    field: screen.getByLabelText('Write a post'),
    submit: screen.getByRole('button', { name: 'Post' }),
  };
}

describe('Composer', () => {
  it('[CNT-1] shows a 0/2000 counter that follows the typed text', async () => {
    const { field } = renderComposer();
    expect(screen.getByText('0/2000')).toBeInTheDocument();
    await userEvent.type(field, 'Hello');
    expect(screen.getByText('5/2000')).toBeInTheDocument();
  });

  it('[CNT-1] empty or blank text shows an inline error on the field and is not sent', async () => {
    const { field, submit, onSubmit } = renderComposer();
    await userEvent.click(submit);
    expect(screen.getByText('Write at least 1 character.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    await userEvent.type(field, '   ');
    await userEvent.click(submit);
    expect(screen.getByText('Write at least 1 character.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('[CNT-1] text over 2,000 characters shows the length and is not sent', async () => {
    const { field, submit, onSubmit } = renderComposer();
    await userEvent.click(field);
    await userEvent.paste('x'.repeat(2140));
    expect(screen.getByText('2140/2000')).toBeInTheDocument();
    await userEvent.click(submit);
    expect(screen.getByText('Keep it under 2,000 characters (2,140).')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('[CNT-1] valid text is sent trimmed and the field is cleared on success', async () => {
    const { field, submit, onSubmit } = renderComposer();
    await userEvent.type(field, '  Hello community  ');
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith('Hello community');
    expect(field).toHaveValue('');
  });

  it('[CNT-1] a failed request keeps the typed text and shows a retryable error', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(429, 'RATE_LIMITED', "You're posting quickly. Try again in 40 seconds.", 'req-1'),
      )
      .mockResolvedValueOnce(undefined);
    const { field, submit } = renderComposer(onSubmit);
    await userEvent.type(field, 'Keep me');
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent("You're posting quickly. Try again in 40 seconds.");
    expect(field).toHaveValue('Keep me');
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(field).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('[CNT-1] a server validation error is shown on the field', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, 'VALIDATION_FAILED', 'Some fields are not valid.', 'req-2', [
          { path: 'body', message: 'Write at least 1 character.' },
        ]),
      );
    const { field, submit } = renderComposer(onSubmit);
    await userEvent.type(field, 'x');
    await userEvent.click(submit);
    expect(await screen.findByText('Write at least 1 character.')).toBeInTheDocument();
    expect(field).toHaveValue('x');
  });
});
