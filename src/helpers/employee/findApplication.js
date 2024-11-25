

async function findApplicationDetails(employeeIdInt, jobPostIdInt) {
    return await prisma.application.findFirst({
      where: {
        employeeId: employeeIdInt,
        jobPostId: jobPostIdInt,
      },
      include: {
        jobPost: {
          include: {
            restaurant: true,
          },
        },
        employee: true,
      },
    });
}