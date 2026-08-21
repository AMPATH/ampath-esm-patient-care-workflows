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

    const { data, error, isLoading, mutate } = useSWR<{ data: { results: any[] } }>(enrollmentsUrl, openmrsFetch);

    return {
        enrollments: data?.data?.results || [],
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
            // Use the URI from the link - openmrsFetch should handle full URLs
            // If it's a full URL, we need to extract just the path part
            const uri = nextLink.uri;
            if (uri.startsWith('http')) {
                // Extract the path part after the domain
                const urlObj = new URL(uri);
                nextUrl = urlObj.pathname + urlObj.search;
            } else {
                nextUrl = uri;
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
