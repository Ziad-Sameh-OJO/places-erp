"use client";
import { useQuery } from "@tanstack/react-query";
import type { OfficeAssetsRegister, OfficeBoyShiftView } from "@places/contracts";
import { api } from "@/lib/api";

export const useOfficeAssets = () => useQuery({ queryKey: ["office-assets"], queryFn: () => api.get<OfficeAssetsRegister>("/procurement/office-assets") });
export const useOfficeBoys = () => useQuery({ queryKey: ["office-boys"], queryFn: () => api.get<OfficeBoyShiftView[]>("/procurement/office-boys") });
