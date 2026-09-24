import "server-only";
import { HttpError } from "./http";
import { driveUrlField } from "./phase4";

export function topicDescriptionField(value: unknown) {
  if (typeof value !== "string" || value.trim().length > 500) {
    throw new HttpError(400, "Konu açıklaması en fazla 500 karakter olabilir.");
  }
  return value.trim();
}

export function topicPdfUrlField(value: unknown) {
  if (value === null || value === "") return null;
  return driveUrlField(value);
}
