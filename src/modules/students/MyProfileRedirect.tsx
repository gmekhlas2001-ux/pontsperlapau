import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getMyStudentRecord } from '@/services/studentService';

export function MyProfileRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    getMyStudentRecord().then((res) => {
      if (res.success && res.studentId) {
        navigate(`/students/${res.studentId}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    });
  }, [navigate]);

  return null;
}
