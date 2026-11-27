"use client";

import type { CustomerDetail } from "@/lib/types";
import { Field, Input, Select, Textarea } from "@/components/ui";

export type CustomerFormValue = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  notes: string;
  tags: string;
  isBusiness: boolean;
};

export const emptyCustomerForm: CustomerFormValue = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  companyName: "",
  notes: "",
  tags: "",
  isBusiness: false,
};

export function customerToForm(customer: CustomerDetail): CustomerFormValue {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    companyName: customer.companyName ?? "",
    notes: customer.notes ?? "",
    tags: customer.tags ?? "",
    isBusiness: customer.isBusiness,
  };
}

export function CustomerForm({
  value,
  onChange,
}: {
  value: CustomerFormValue;
  onChange: (value: CustomerFormValue) => void;
}) {
  const set = <K extends keyof CustomerFormValue>(key: K, next: CustomerFormValue[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" required>
          <Input
            value={value.firstName}
            onChange={(event) => set("firstName", event.target.value)}
            placeholder="Jordan"
            required
          />
        </Field>
        <Field label="Last name" required>
          <Input
            value={value.lastName}
            onChange={(event) => set("lastName", event.target.value)}
            placeholder="Rivera"
            required
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <Input
            type="email"
            value={value.email}
            onChange={(event) => set("email", event.target.value)}
            placeholder="jordan@example.com"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={value.phone}
            onChange={(event) => set("phone", event.target.value)}
            placeholder="+1 555 0100"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company">
          <Input
            value={value.companyName}
            onChange={(event) => set("companyName", event.target.value)}
            placeholder="Acme Inc."
          />
        </Field>
        <Field label="Account type">
          <Select
            value={value.isBusiness ? "business" : "individual"}
            onChange={(event) => set("isBusiness", event.target.value === "business")}
          >
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </Select>
        </Field>
      </div>
      <Field label="Tags" hint="Comma separated, for example: wholesale, priority.">
        <Input
          value={value.tags}
          onChange={(event) => set("tags", event.target.value)}
          placeholder="wholesale, priority"
        />
      </Field>
      <Field label="Notes">
        <Textarea
          value={value.notes}
          onChange={(event) => set("notes", event.target.value)}
          placeholder="Context that helps the team serve this customer."
          rows={3}
        />
      </Field>
    </div>
  );
}

export function customerPayload(value: CustomerFormValue) {
  return {
    firstName: value.firstName.trim(),
    lastName: value.lastName.trim(),
    email: value.email.trim() || null,
    phone: value.phone.trim() || null,
    companyName: value.companyName.trim() || null,
    notes: value.notes.trim() || null,
    tags: value.tags.trim() || null,
    isBusiness: value.isBusiness,
    externalSource: null,
    externalId: null,
  };
}
