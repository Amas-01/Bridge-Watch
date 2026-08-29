import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listServiceAnnotations,
  getServiceAnnotation,
  createServiceAnnotation,
  updateServiceAnnotation,
  deleteServiceAnnotation,
  getServiceAnnotationAudit,
} from "../services/api";
import type {
  CreateServiceAnnotationInput,
  UpdateServiceAnnotationInput,
} from "../types";

const annotationsKey = "service-annotations" as const;

export function useServiceAnnotations(params?: {
  serviceName?: string;
  entityType?: string;
  entityId?: string;
  active?: string;
  author?: string;
}) {
  return useQuery({
    queryKey: [annotationsKey, params],
    queryFn: () => listServiceAnnotations(params),
  });
}

export function useServiceAnnotation(id: string | undefined) {
  return useQuery({
    queryKey: [annotationsKey, id],
    queryFn: () => getServiceAnnotation(id!),
    enabled: !!id,
  });
}

export function useCreateServiceAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceAnnotationInput) =>
      createServiceAnnotation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [annotationsKey] });
    },
  });
}

export function useUpdateServiceAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateServiceAnnotationInput;
    }) => updateServiceAnnotation(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [annotationsKey] });
    },
  });
}

export function useDeleteServiceAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteServiceAnnotation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [annotationsKey] });
    },
  });
}

export function useServiceAnnotationAudit(id: string | undefined) {
  return useQuery({
    queryKey: [annotationsKey, "audit", id],
    queryFn: () => getServiceAnnotationAudit(id!),
    enabled: !!id,
  });
}
