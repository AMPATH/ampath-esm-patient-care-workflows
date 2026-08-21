import useSWR from 'swr';
import { openmrsFetch, restBaseUrl, useConfig } from '@openmrs/esm-framework';
import dayjs from 'dayjs';
import { Config } from '../config-schema';

export function usePatientProgramConfig(patientUuid: string) {
    const config = useConfig<Config>();
    const etlBaseUrl = config.etlBaseUrl || '/openmrs/etl';
    const url = patientUuid ? `${etlBaseUrl}/patient-program-config?patientUuid=${patientUuid}` : null;
    const { data, error, isLoading } = useSWR(url, (url) =>
        fetch(url, {}).then((res) => res.json())
    );

    return {
        config: data,
        error,
        isLoading,
    };
}

export function useEnrollments(patientUuid: string) {
    const customRepresentation =
        'custom:(uuid,display,program:(uuid,display),dateEnrolled,dateCompleted,location:(uuid,display))';
    const enrollmentsUrl = patientUuid
        ? `${restBaseUrl}/programenrollment?patient=${patientUuid}&v=${customRepresentation}`
        : null;

    const { data, error, isLoading, mutate } = useSWR<{ data: any }>(enrollmentsUrl, openmrsFetch);

    // Handle different response structures:
    // 1. { results: [...] } - standard OpenMRS REST API format
    // 2. [...] - direct array (some endpoints return this)
    // 3. { data: { results: [...] } } - nested structure
    let enrollments: any[] = [];
    if (data?.data) {
        const responseData = data.data;
        
        // If it's an array directly, use it
        if (Array.isArray(responseData)) {
            enrollments = responseData;
        }
        // If it has a results array, use that
        else if (responseData.results && Array.isArray(responseData.results)) {
            enrollments = responseData.results;
        }
    }
console.log("enrollments api",enrollments);
    return {
        enrollments,
        error,
        isLoading,
        mutate,
    };
}

export function useVisits(patientUuid: string) {
    const customRepresentation = 'custom:(uuid,visitType:(uuid,name),startDatetime,stopDatetime,location:(uuid,name))';
    const visitsUrl = patientUuid
        ? `${restBaseUrl}/visit?patient=${patientUuid}&v=${customRepresentation}&includeInactive=false`
        : null;

    const { data, error, isLoading, mutate } = useSWR<{ data: { results: any[] } }>(visitsUrl, openmrsFetch);

    return {
        visits: data?.data?.results || [],
        error,
        isLoading,
        mutate,
    };
}

export function evaluateAllowedIf(expression: string, context: any): boolean {
    if (!expression) {
        return true;
    }
    try {
        const argNames = Object.keys(context);
        const argValues = Object.values(context);
        const func = new Function(...argNames, `return (${expression});`);
        return func(...argValues);
    } catch (e) {
        console.error(`Error evaluating expression: "${expression}"`, e);
        return false;
    }
}

export function useForms() {
    const customRepresentation =
        'custom:(uuid,name,display,encounterType:(uuid,name),version,published,retired,resources:(uuid,name,dataType,valueReference))';
    const { data, error, isLoading } = useSWR<{ data: { results: any[] } }>(
        `${restBaseUrl}/form?v=${customRepresentation}&q=POC`,
        openmrsFetch
    );

    return {
        forms: data?.data?.results.filter((form) => form.published === true && form.retired === false) || [],
        isLoading,
        isError: error,
    };
}

export function usePrograms() {
    const customRepresentation = 'custom:(uuid,name,display,allWorkflows,concept:(uuid,display))';
    const { data, error, isLoading, mutate } = useSWR<{ data: { results: any[] } }>(
        `${restBaseUrl}/program?v=${customRepresentation}`,
        openmrsFetch
    );

    return {
        programs: data?.data?.results || [],
        isLoading,
        isError: error,
        mutate,
    };
}

interface LocationResponse {
    results: any[];
    links?: Array<{ rel: string; uri: string }>;
}

/**
 * Fetches all locations by handling pagination
 */
async function fetchAllLocations(customRepresentation: string): Promise<any[]> {
    const allLocations: any[] = [];
    let nextUrl: string | null = `${restBaseUrl}/location?v=${customRepresentation}&limit=100`;

    while (nextUrl) {
        const response = await openmrsFetch<LocationResponse>(nextUrl);
        // openmrsFetch wraps the response in { data: ... }
        const responseData = response.data;
        const results = responseData?.results || [];
        allLocations.push(...results);

        // Check for next page
        const links = responseData?.links || [];
        const nextLink = links.find((link) => link.rel === 'next');
        if (nextLink) {
            const uri = nextLink.uri;
            
            // Extract the path from the URI (handles both full URLs and relative paths)
            let pathToNormalize: string;
            if (uri.startsWith('http')) {
                const urlObj = new URL(uri);
                pathToNormalize = urlObj.pathname + urlObj.search;
            } else {
                pathToNormalize = uri;
            }
            
            // Normalize the path to be relative to restBaseUrl
            // restBaseUrl is '/openmrs/ws/rest/v1'
            // We need to extract just the resource path (e.g., '/location?...')
            if (pathToNormalize.startsWith(restBaseUrl)) {
                // Path starts with restBaseUrl, extract the relative part
                nextUrl = pathToNormalize.substring(restBaseUrl.length);
            } else {
                // Try to find and remove '/openmrs/ws/rest/v1' pattern
                // This handles cases where the path might have /openmrs prefix
                const patternToRemove = '/openmrs/ws/rest/v1';
                if (pathToNormalize.startsWith(patternToRemove)) {
                    nextUrl = pathToNormalize.substring(patternToRemove.length);
                } else if (pathToNormalize.startsWith('/openmrs')) {
                    // Path starts with /openmrs but not the full pattern
                    // Extract everything after /openmrs
                    const afterOpenmrs = pathToNormalize.substring('/openmrs'.length);
                    // Check if it continues with /ws/rest/v1
                    if (afterOpenmrs.startsWith('/ws/rest/v1')) {
                        nextUrl = afterOpenmrs.substring('/ws/rest/v1'.length);
                    } else {
                        // Just remove /openmrs prefix
                        nextUrl = afterOpenmrs;
                    }
                } else {
                    // Path doesn't start with /openmrs, use as-is
                    nextUrl = pathToNormalize;
                }
            }
        } else {
            nextUrl = null;
        }
    }

    return allLocations;
}

export function useLocations() {
    const customRepresentation = 'custom:(uuid,name,display)';
    const { data, error, isLoading } = useSWR<any[]>(
        `locations-all-${customRepresentation}`, // Use a stable key for all locations
        () => fetchAllLocations(customRepresentation)
    );

    return {
        locations: data || [],
        isLoading,
        isError: error,
    };
}

export async function startVisit(
    patientUuid: string,
    visitTypeUuid: string,
    locationUuid: string
) {
    const visit = {
        patient: patientUuid,
        visitType: visitTypeUuid,
        location: locationUuid,
        startDatetime: new Date().toISOString(),
    };

    const response = await openmrsFetch(`${restBaseUrl}/visit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: visit,
    });

    return response.data;
}

export async function enrollPatientInProgram(
    patientUuid: string,
    programUuid: string,
    enrollmentDate: string,
    locationUuid?: string
) {
    const enrollment: any = {
        patient: patientUuid,
        program: programUuid,
        dateEnrolled: enrollmentDate,
    };

    if (locationUuid) {
        enrollment.location = locationUuid;
    }

    const response = await openmrsFetch(`${restBaseUrl}/programenrollment`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: enrollment,
    });

    return response.data;
}

export async function disenrollPatientFromProgram(
    enrollmentUuid: string,
    disenrollmentDate: string,
    reason?: string
) {
    const enrollment: any = {
        dateCompleted: disenrollmentDate,
    };

    if (reason) {
        enrollment.voidReason = reason;
    }

    const response = await openmrsFetch(`${restBaseUrl}/programenrollment/${enrollmentUuid}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: enrollment,
    });

    return response.data;
}

export function usePatient(patientUuid: string) {
    const customRepresentation = 'custom:(uuid,display,person:(uuid,display,gender,age,birthdate,dead,deathDate),identifiers:(uuid,display,identifier))';
    const patientUrl = patientUuid
        ? `${restBaseUrl}/patient/${patientUuid}?v=${customRepresentation}`
        : null;

    const { data, error, isLoading } = useSWR<{ data: any }>(patientUrl, openmrsFetch);

    return {
        patient: data?.data || null,
        error,
        isLoading,
    };
}

export function calculateAge(birthdate: string | null | undefined): number | null {
    if (!birthdate) return null;
    return dayjs().diff(dayjs(birthdate), 'year');
}

/**
 * Formats date to OpenMRS format (YYYY-MM-DDTHH:mm:ssZ)
 * Subtracts 3 minutes to handle timezone offset, matching ng2-amrs pattern
 * Note: OpenMRS REST API also accepts YYYY-MM-DD format for dates
 */
export function toOpenmrsDateFormat(dateToConvert?: Date | string | null): string {
    if (!dateToConvert) {
        dateToConvert = new Date();
    }
    const date = dayjs(dateToConvert);
    if (date.isValid()) {
        // Subtract 3 minutes to handle timezone offset (as per ng2-amrs pattern)
        return date.subtract(3, 'm').format('YYYY-MM-DDTHH:mm:ssZ');
    }
    return '';
}

/**
 * Updates an existing program enrollment
 * This matches the createUpdatePatientEnrollment logic from PatientReferralService
 * Can be used to update enrollment details or disenroll by setting dateCompleted
 */
export async function updateProgramEnrollment(
    enrollmentUuid: string,
    programUuid: string,
    patientUuid: string,
    dateEnrolled: string,
    dateCompleted: string | null,
    locationUuid: string
) {
    const enrollment: any = {
        patient: patientUuid,
        program: programUuid,
        dateEnrolled: dateEnrolled,
        location: locationUuid,
    };

    if (dateCompleted) {
        enrollment.dateCompleted = dateCompleted;
    }

    const response = await openmrsFetch(`${restBaseUrl}/programenrollment/${enrollmentUuid}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: enrollment,
    });

    return response.data;
}

/**
 * Fetches visit types for a specific program enrollment and location
 * This matches the getPatientProgramVisitTypes from PatientProgramResourceService
 */
export function usePatientProgramVisitTypes(
    patientUuid: string,
    programUuid: string,
    enrollmentUuid: string,
    intendedLocationUuid: string
) {
    const config = useConfig<Config>();
    const etlBaseUrl = config.etlBaseUrl || '/openmrs/etl';
    const url = patientUuid && programUuid && enrollmentUuid && intendedLocationUuid
        ? `${etlBaseUrl}/patient/${patientUuid}/program/${programUuid}/enrollment/${enrollmentUuid}?intendedLocationUuid=${intendedLocationUuid}`
        : null;

    const { data, error, isLoading } = useSWR(url, (url) =>
        fetch(url, {}).then((res) => res.json())
    );

    return {
        visitTypesData: data,
        allowedVisitTypes: data?.visitTypes?.allowed || [],
        disallowedVisitTypes: data?.visitTypes?.disallowed || [],
        error,
        isLoading,
    };
}
