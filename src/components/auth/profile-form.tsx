"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function ProfileForm({
  userId,
  email,
  fullName,
  phoneNumber,
  address,
  country,
}: {
  userId: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  address: string;
  country: string;
}) {
  const [name, setName] = useState(fullName);
  const [phone, setPhone] = useState(phoneNumber);
  const [postalAddress, setPostalAddress] = useState(address);
  const [countryName, setCountryName] = useState(country);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter your name before saving.");
      return;
    }
    if (phone.trim().length > 32 || postalAddress.trim().length > 300 || countryName.trim().length > 100) {
      setError("Phone number, address, or country exceeds the allowed length.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await createClient()
        .from("profiles")
        .update({
          full_name: trimmedName,
          phone_number: phone.trim() || null,
          address: postalAddress.trim() || null,
          country: countryName.trim() || null,
        })
        .eq("id", userId)
        .select("id")
        .single();
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setName(trimmedName);
      setPhone(phone.trim());
      setPostalAddress(postalAddress.trim());
      setCountryName(countryName.trim());
      setNotice("Your profile has been updated.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update your profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="profile-name" className="mb-2 block text-sm text-slate-300">Full name</label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={100}
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="profile-email" className="mb-2 block text-sm text-slate-300">Email address</label>
        <input
          id="profile-email"
          type="email"
          value={email}
          readOnly
          className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-400"
        />
      </div>
      <div>
        <label htmlFor="profile-phone" className="mb-2 block text-sm text-slate-300">Phone number</label>
        <input
          id="profile-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          maxLength={32}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="profile-address" className="mb-2 block text-sm text-slate-300">Address</label>
        <textarea
          id="profile-address"
          value={postalAddress}
          onChange={(event) => setPostalAddress(event.target.value)}
          autoComplete="street-address"
          maxLength={300}
          rows={3}
          className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="profile-country" className="mb-2 block text-sm text-slate-300">Country</label>
        <input
          id="profile-country"
          type="text"
          value={countryName}
          onChange={(event) => setCountryName(event.target.value)}
          autoComplete="country-name"
          maxLength={100}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
        />
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-200">{notice}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
