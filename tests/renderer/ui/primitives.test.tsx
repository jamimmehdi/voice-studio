import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { BarSlider } from '@renderer/ui/BarSlider';
import { Button } from '@renderer/ui/Button';
import { Card } from '@renderer/ui/Card';
import { Knob } from '@renderer/ui/Knob';
import { Modal } from '@renderer/ui/Modal';
import { SelectField } from '@renderer/ui/SelectField';
import { Switch } from '@renderer/ui/Switch';
import { ToggleButton } from '@renderer/ui/ToggleButton';

describe('Switch', () => {
  it('is an accessible switch that reports the next value', () => {
    const onChange = vi.fn();
    render(<Switch label="Gate" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Gate' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects the checked state and does not fire when disabled', () => {
    const onChange = vi.fn();
    render(<Switch label="Gate" checked disabled onChange={onChange} />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not let the click bubble to a clickable parent (chain nodes)', () => {
    const parent = vi.fn();
    render(
      <div onClick={parent}>
        <Switch label="x" checked={false} onChange={() => undefined} />
      </div>,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(parent).not.toHaveBeenCalled();
  });
});

describe('Knob', () => {
  function Harness({
    initial = 0,
    onSpy,
  }: {
    initial?: number;
    onSpy?: (v: number) => void;
  }): React.ReactElement {
    const [v, setV] = useState(initial);
    return (
      <Knob
        label="PITCH"
        min={-12}
        max={12}
        step={0.1}
        unit=" st"
        value={v}
        defaultValue={0}
        onChange={(n) => {
          setV(n);
          onSpy?.(n);
        }}
      />
    );
  }

  it('exposes slider semantics and a formatted value', () => {
    render(<Harness initial={4.5} />);
    const knob = screen.getByRole('slider', { name: 'PITCH' });
    expect(knob).toHaveAttribute('aria-valuemin', '-12');
    expect(knob).toHaveAttribute('aria-valuemax', '12');
    expect(knob).toHaveAttribute('aria-valuenow', '4.5');
    expect(knob).toHaveAttribute('aria-valuetext', '4.5 st');
    expect(screen.getByText('4.5 st')).toBeInTheDocument();
  });

  it('dragging upwards raises the value, Shift is finer', () => {
    const spy = vi.fn();
    render(<Harness onSpy={spy} />);
    const knob = screen.getByRole('slider');
    fireEvent.pointerDown(knob, { clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 155, pointerId: 1 }); // 45 px up = a quarter of the 180 px travel
    expect(spy).toHaveBeenLastCalledWith(6);
    fireEvent.pointerUp(knob, { pointerId: 1 });

    spy.mockClear();
    fireEvent.pointerDown(knob, { clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 155, pointerId: 1, shiftKey: true });
    const fine = spy.mock.calls.at(-1)![0] as number;
    expect(fine).toBeCloseTo(6 + 1.2, 1); // starts at 6 st; a Shift drag of the same distance adds only 1.2 st
  });

  it('ignores movement without a press', () => {
    const spy = vi.fn();
    render(<Harness onSpy={spy} />);
    fireEvent.pointerMove(screen.getByRole('slider'), { clientY: 10, pointerId: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('double click resets to the default', () => {
    render(<Harness initial={7} />);
    fireEvent.doubleClick(screen.getByRole('slider'));
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0');
  });

  it('mouse wheel and arrow keys step the value', () => {
    render(<Harness />);
    const knob = screen.getByRole('slider');
    fireEvent.wheel(knob, { deltaY: -100 });
    expect(knob).toHaveAttribute('aria-valuenow', '0.5');
    fireEvent.keyDown(knob, { key: 'ArrowDown' });
    expect(knob).toHaveAttribute('aria-valuenow', '0');
    fireEvent.keyDown(knob, { key: 'End' });
    expect(knob).toHaveAttribute('aria-valuenow', '12');
    fireEvent.keyDown(knob, { key: 'Home' });
    expect(knob).toHaveAttribute('aria-valuenow', '-12');
  });

  it('does not call onChange when the value would not change', () => {
    const spy = vi.fn();
    render(<Knob label="X" min={0} max={10} value={10} defaultValue={5} onChange={spy} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('BarSlider', () => {
  it('shows its fill via the --p custom property and reports numbers', () => {
    const onChange = vi.fn();
    render(<BarSlider label="Mix" value={25} min={0} max={100} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Mix' });
    expect(slider.style.getPropertyValue('--p')).toBe('25%');
    fireEvent.change(slider, { target: { value: '60' } });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('double click restores the default when one is given', () => {
    const onChange = vi.fn();
    render(<BarSlider label="Mix" value={25} min={0} max={100} defaultValue={100} onChange={onChange} />);
    fireEvent.doubleClick(screen.getByRole('slider'));
    expect(onChange).toHaveBeenCalledWith(100);
  });
});

describe('Modal', () => {
  it('closes on Escape, on the close button and on a backdrop click, but not on inside clicks', () => {
    const onClose = vi.fn();
    render(
      <Modal title="About" onClose={onClose}>
        <p>content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'About' })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('content'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('small widgets', () => {
  it('Button renders variants and forwards clicks', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Go
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('ToggleButton exposes aria-pressed', () => {
    const onChange = vi.fn();
    render(
      <ToggleButton pressed={false} onChange={onChange}>
        Listen
      </ToggleButton>,
    );
    const b = screen.getByRole('button', { name: 'Listen' });
    expect(b).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(b);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('SelectField returns the typed option value', () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="SLOPE"
        value={12}
        options={[
          { value: 12, label: '12 dB' },
          { value: 24, label: '24 dB' },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '24' } });
    expect(onChange).toHaveBeenCalledWith(24);
  });

  it('Card renders a heading and an aside', () => {
    render(
      <Card title="Levels" aside="note">
        <span>body</span>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Levels' })).toBeInTheDocument();
    expect(screen.getByText('note')).toBeInTheDocument();
  });
});
