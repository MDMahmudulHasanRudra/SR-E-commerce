"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, query } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { CustomerDetail, CustomerListItem } from "@/lib/types";
import { Icon } from "@/components/icons";
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
  excludeCustomerId,
}: {
  value: CustomerFormValue;
  onChange: (value: CustomerFormValue) => void;
  excludeCustomerId?: string;
}) {
  const set = <K extends keyof CustomerFormValue>(key: K, next: CustomerFormValue[K]) =>
    onChange({ ...value, [key]: next });

  const debouncedEmail = useDebounced(value.email.trim(), 350);
  const debouncedPhone = useDebounced(value.phone.trim(), 350);
  const [duplicates, setDuplicates] = useState<CustomerListItem[]>([]);

  useEffect(() => {
    if (!debouncedEmail && !debouncedPhone) {
      setDuplicates([]);
      return;
    }
    let cancelled = false;
    api<CustomerListItem[]>(
      `/api/v1/customers/duplicates${query({
        email: debouncedEmail || undefined,
        phone: debouncedPhone || undefined,
      })}`,
    )
      .then((rows) => {
        if (cancelled) return;
        setDuplicates(rows.filter((row) => row.id !== excludeCustomerId));
      })
      .catch(() => {
        if (!cancelled) setDuplicates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedEmail, debouncedPhone, excludeCustomerId]);

  return (
    <div className="space-y-3">
      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11.5px] text-amber-900">
          <p className="flex items-center gap-1.5 font-medium">
            <Icon name="alert" size={14} className="text-amber-700" />
            Possible duplicate customer(s) found in this workspace
          </p>
          <ul className="mt-1.5 space-y-1">
            {duplicates.map((dup) => (
              <li key={dup.id} className="flex items-center justify-between gap-2">
                <span>
                  {dup.displayName} ({dup.email ?? dup.phone ?? "No contact"})
                </span>
                <Link href={`/customers/${dup.id}`} className="font-medium text-brand hover:underline">
                  Open profile
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

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
