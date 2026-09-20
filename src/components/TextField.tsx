import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import './TextField.css';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** Labeled input matching the design's form fields (OfferingDetail,
    AddClient, etc.) — no border, surface background, soft shadow. */
export function TextField({ label, id, className = '', ...props }: TextFieldProps) {
  return (
    <div className="text-field">
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} className={className} {...props} />
    </div>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function TextAreaField({ label, id, className = '', ...props }: TextAreaFieldProps) {
  return (
    <div className="text-field">
      {label && <label htmlFor={id}>{label}</label>}
      <textarea id={id} className={className} {...props} />
    </div>
  );
}
