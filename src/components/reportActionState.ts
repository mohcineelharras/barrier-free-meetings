export type AutoReportStatus = 'idle' | 'pending' | 'ready' | 'error';

interface ReportActionStateInput {
  translationAvailable: boolean;
  hasSegments: boolean;
  isRecording: boolean;
  hasReport: boolean;
  autoReportStatus: AutoReportStatus;
}

interface ReportActionState {
  visible: boolean;
  label: string;
  title: string;
  disabled: boolean;
}

export function getReportActionState(input: ReportActionStateInput): ReportActionState {
  if (!input.translationAvailable || !input.hasSegments) {
    return {
      visible: false,
      label: '',
      title: '',
      disabled: true,
    };
  }

  if (input.hasReport) {
    return {
      visible: true,
      label: 'View report',
      title: 'View report',
      disabled: false,
    };
  }

  if (input.isRecording) {
    return {
      visible: true,
      label: 'Report after recording',
      title: 'Report will generate after recording stops',
      disabled: true,
    };
  }

  if (input.autoReportStatus === 'pending') {
    return {
      visible: true,
      label: 'Generating report…',
      title: 'Generating report…',
      disabled: true,
    };
  }

  if (input.autoReportStatus === 'error') {
    return {
      visible: true,
      label: 'Retry report',
      title: 'Retry report',
      disabled: false,
    };
  }

  return {
    visible: true,
    label: 'Generate report',
    title: 'Generate report',
    disabled: false,
  };
}
