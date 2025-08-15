const buildFilters = (query, filterFields) => {
  return filterFields.reduce((filters, field) => {
    const fieldValue = query[field]; 

    if (fieldValue) {
      if (field === 'benefits') {
        filters[field] = {
          hasSome: fieldValue
            .split(',')
            .map(benefit => benefit.trim().toLowerCase()) 
            .filter(Boolean),
        };
      } else {
        filters[field] = {
          contains: fieldValue.toLowerCase(),
          mode: 'insensitive',
        };
      }
    }

    return filters;
  }, {});
};



const buildSearchConditions = (searchTerm, searchField) => {
    return searchTerm
      ? { [searchField]: { contains: searchTerm, mode: 'insensitive' } }
      : undefined;
};

module.exports = { buildFilters, buildSearchConditions };


// const buildFilters = (query, filterFields) => {
//   return filterFields.reduce((filters, field) => {
//     const fieldValue = query[field]; // The value for the current field from the query

//     // Only proceed if there's a value for the field
//     if (fieldValue) {
//       if (field === 'benefits') {
//         // Handle benefits field: split by commas, trim spaces, and convert to lowercase
//         const benefits = fieldValue
//           .split(',')
//           .map(benefit => benefit.trim().toLowerCase())
//           .filter(Boolean);  // Remove any empty strings

//         if (benefits.length > 0) {
//           filters[field] = {
//             hasSome: benefits,  // Only add the filter if benefits are not empty
//           };
//         }
//       } else {
//         filters[field] = {
//           contains: fieldValue.toLowerCase(),  // Case insensitive filtering
//           mode: 'insensitive',
//         };
//       }
//     }

//     return filters;
//   }, {});
// };
