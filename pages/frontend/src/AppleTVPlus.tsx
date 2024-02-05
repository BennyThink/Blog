import {
  Box,
  Table,
  Tbody,
  Progress,
  Text,
  Td,
  Link,
  Th,
  Thead,
  Tr,
  useToast,
  Heading,
} from "@chakra-ui/react";
import axios from "axios";
import React from "react";
import {
  ExternalLinkIcon,
  TriangleDownIcon,
  TriangleUpIcon,
} from "@chakra-ui/icons";
import { createColumnHelper } from "@tanstack/react-table";
import { chakra } from "@chakra-ui/react";
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  ColumnDef,
  SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";

interface Subscription {
  code: string;
  name: string;
  local_price: number;
  currency: string;
  usd_price: number;
}

interface Response {
  prices: Subscription[];
  updated_at: string;
  progress: number;
}

type DataTableProps<Data extends object> = {
  data: Data[];
  columns: ColumnDef<Data, any>[];
};

function DataTable<Data extends object>({
  data,
  columns,
}: DataTableProps<Data>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  return (
    <Table>
      <Thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <Tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              // see https://tanstack.com/table/v8/docs/api/core/column-def#meta to type this correctly
              const meta: any = header.column.columnDef.meta;
              return (
                <Th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  isNumeric={meta?.isNumeric}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}

                  <chakra.span pl="4">
                    {header.column.getIsSorted() ? (
                      header.column.getIsSorted() === "desc" ? (
                        <TriangleDownIcon aria-label="sorted descending" />
                      ) : (
                        <TriangleUpIcon aria-label="sorted ascending" />
                      )
                    ) : null}
                  </chakra.span>
                </Th>
              );
            })}
          </Tr>
        ))}
      </Thead>
      <Tbody>
        {table.getRowModel().rows.map((row) => (
          <Tr key={row.id}>
            {row.getVisibleCells().map((cell) => {
              // see https://tanstack.com/table/v8/docs/api/core/column-def#meta to type this correctly
              const meta: any = cell.column.columnDef.meta;
              return (
                <Td key={cell.id} isNumeric={meta?.isNumeric}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Td>
              );
            })}
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

const AppleTVPlus: React.FC = () => {
  document.title = "Apple TV+ Global Price";
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const [update, setUpdate] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const columnHelper = createColumnHelper<Subscription>();
  const toast = useToast();
  React.useEffect(() => {
    axios
      .get<Response>("/api/apple-tv-plus")
      .then((res) => {
        setSubscriptions(res.data.prices);
        setUpdate(res.data.updated_at);
        setProgress(res.data.progress);
      })
      .catch((err) => {
        toast({
          title: "Error",
          description: err.response.data.message,
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      });
  }, [toast]);

  const columns = [
    columnHelper.accessor((_, rowIndex) => rowIndex + 1, {
      id: "index", // Unique ID for the column
      header: "ID",
      cell: (info) => info.getValue(),
    }),

    columnHelper.accessor("code", {
      id: "code",
      cell: (info) => info.getValue(),
      header: "Region Code",
    }),
    columnHelper.accessor("name", {
      id: "name",
      cell: (info) => info.getValue(),
      header: "Region Name",
    }),
    columnHelper.accessor("local_price", {
      id: "local_price",
      cell: (info) => info.getValue(),
      header: "Local Price",
      meta: {
        isNumeric: true,
      },
    }),
    columnHelper.accessor("usd_price", {
      id: "usd_price",
      cell: (info) => info.getValue(),
      header: "USD Price",
      meta: {
        isNumeric: true,
      },
    }),
    columnHelper.accessor((row) => `https://tv.apple.com/${row.code}`, {
      id: "link",
      cell: (info) => (
        <Link href={info.getValue()} isExternal>
          Link <ExternalLinkIcon mx="2px" />
        </Link>
      ),
      header: "Link",
      enableSorting: false,
    }),
  ];

  return (
    <Box overflowX="auto">
      <Heading>Apple TV+ Global Price</Heading>
      <Text>You can click header to sort, last updated at: {update}</Text>

      {progress < 50 && (
        <>
          <Text>Loading....</Text>
          <Progress value={progress} />
        </>
      )}
      <br />

      <DataTable columns={columns} data={subscriptions} />
      <br />
      <Heading as="h1" size="lg">
        How to subscribe Apple TV+ from cheaper region?
      </Heading>
      <Text>
        1. Register a new Apple ID with the region you want to subscribe
      </Text>
      <Text>
        2. Buy gift card from{" "}
        <Link href="https://www.g2a.com/n/reflink-a6460bbb08" isExternal>
          G2A <ExternalLinkIcon mx="2px" />
        </Link>
        <Link
          href="https://www.eneba.com/store/apple-gift-cards?drms[]=apple&page=1&types[]=top_up"
          isExternal
        >
          eneba <ExternalLinkIcon mx="2px" />
        </Link>
      </Text>
      <Text>3. Redeem your gift card</Text>
      <Text>4. in-App purchase</Text>
    </Box>
  );
};

export default AppleTVPlus;
